<!--
  - @copyright Copyright (c) 2018 John Molakvoæ <skjnldsv@protonmail.com>
  -
  - @author John Molakvoæ <skjnldsv@protonmail.com>
  -
  - @license GNU AGPL version 3 or any later version
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU Affero General Public License as
  - published by the Free Software Foundation, either version 3 of the
  - License, or (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  - GNU Affero General Public License for more details.
  -
  - You should have received a copy of the GNU Affero General Public License
  - along with this program. If not, see <http://www.gnu.org/licenses/>.
  -
  -->
<template>
	<AppNavigationItem
		:key="group.key"
		:to="group.router"
		:title="group.name"
		:icon="group.icon">
		<template slot="actions">
			<ActionButton
				icon="icon-add"
				:close-after-click="true"
				@click="addContactsToGroup(group)">
				{{ t('contacts', 'Add contacts') }}
			</ActionButton>
			<ActionButton
				icon="icon-download"
				:close-after-click="true"
				@click="downloadGroup(group)">
				{{ t('contacts', 'Download') }}
			</ActionButton>
			<ActionButton
				icon="icon-mail"
				@click="emailGroup(group)">
				{{ t('contacts', 'Send email') }}
			</ActionButton>
		</template>

		<AppNavigationCounter v-if="group.contacts.length > 0" slot="counter">
			{{ group.contacts.length }}
		</AppNavigationCounter>
	</AppNavigationItem>
</template>

<script>
import { emit } from '@nextcloud/event-bus'
import download from 'downloadjs'
import moment from 'moment'

import ActionButton from '@nextcloud/vue/dist/Components/ActionButton'
import AppNavigationCounter from '@nextcloud/vue/dist/Components/AppNavigationCounter'
import AppNavigationItem from '@nextcloud/vue/dist/Components/AppNavigationItem'

export default {
	name: 'GroupNavigationItem',

	components: {
		ActionButton,
		AppNavigationCounter,
		AppNavigationItem,
	},

	props: {
		group: {
			type: Object,
			required: true,
		},
	},

	computed: {
		contacts() {
			return this.$store.getters.getContacts
		},
	},

	methods: {
		// Trigger the entity picker view
		addContactsToGroup() {
			emit('contacts:group:append', this.group.name)
		},

		/**
		 * Download group of contacts
		 *
		 * @param {object} group of contacts to be downloaded
		 */
		downloadGroup(group) {
			// get grouped contacts
			let groupedContacts = {}
			group.contacts.forEach(key => {
				const id = this.contacts[key].addressbook.id
				groupedContacts = Object.assign({
					[id]: {
						addressbook: this.contacts[key].addressbook,
						contacts: [],
					},
				}, groupedContacts)
				groupedContacts[id].contacts.push(this.contacts[key].url)
			})

			// create vcard promise with the requested contacts
			const vcardPromise = Promise.all(
				Object.keys(groupedContacts).map(key =>
					groupedContacts[key].addressbook.dav.addressbookMultigetExport(groupedContacts[key].contacts)))
				.then(response => ({
					groupName: group.name,
					data: response.map(data => data.body).join(''),
				}))

			// download vcard
			this.downloadVcardPromise(vcardPromise)
		},

		/**
		 * Download vcard promise as vcard file
		 *
		 * @param {Promise} vcardPromise the full vcf file promise
		 */
		async downloadVcardPromise(vcardPromise) {
			vcardPromise.then(response => {
				const filename = moment().format('YYYY-MM-DD_HH-mm') + '_' + response.groupName + '.vcf'
				download(response.data, filename, 'text/vcard')
			})
		},

		/**
		 * Open mailto: for contacts in a group
		 *
		 * @param {Object} group of contacts to be emailed
		 */
		emailGroup(group) {
			const emails = []
			group.contacts.forEach(key => {
				// The email property could contain "John Doe <john.doe@example.com>", but vcard spec only
				// allows addr-spec, not name-addr, so to stay compliant, replace everything outside of <>
				const email = this.contacts[key].email.replace(/(.*<)([^>]*)(>)/g, '$2').trim()
				const name = this.contacts[key].fullName.replace(/[,<>]/g, '').trim()
				if (email === '') {
					return
				}
				if (name === null || name === '') {
					emails.push(email)
					return
				}
				emails.push(`${name} <${email}>`)
			})
			// We could just do mailto:${emails}, but if we want to use name-addr, not addr-spec, then we
			// have to explicitly set the "To:" header.
			window.location.href = `mailto:?to=${emails.map(encodeURIComponent).join(',')}`
		},

	},
}
</script>

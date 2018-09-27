/**
 * @copyright Copyright (c) 2018 John Molakvoæ <skjnldsv@protonmail.com>
 *
 * @author John Molakvoæ <skjnldsv@protonmail.com>
 * @author Team Popcorn <teampopcornberlin@gmail.com>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 */

import Vue from 'vue'
import ICAL from 'ical.js'
import parseVcf from '../services/parseVcf'
import client from '../services/cdav'
import Contact from '../models/contact'
import pLimit from 'p-limit'

const addressbookModel = {
	id: '',
	displayName: '',
	enabled: true,
	owner: '',
	shares: [],
	contacts: {},
	url: '',
	readOnly: false,
	dav: false
}

const state = {
	addressbooks: []
}

/**
 * map a dav collection to our addressbook object model
 *
 * @param {Object} addressbook the addressbook object from the cdav library
 * @returns {Object}
 */
export function mapDavCollectionToAddressbook(addressbook) {
	return {
		// get last part of url
		id: addressbook.url.split('/').slice(-2, -1)[0],
		displayName: addressbook.displayname,
		enabled: addressbook.enabled !== false,
		owner: addressbook.owner,
		readOnly: addressbook.readOnly !== false,
		url: addressbook.url,
		dav: addressbook
	}
}

const mutations = {

	/**
	 * Add addressbook into state
	 *
	 * @param {Object} state the store data
	 * @param {Object} addressbook the addressbook to add
	 */
	addAddressbook(state, addressbook) {
		// extend the addressbook to the default model
		state.addressbooks.push(Object.assign({}, addressbookModel, addressbook))
	},

	/**
	 * Delete addressbook
	 *
	 * @param {Object} state the store data
	 * @param {Object} addressbook the addressbook to delete
	 */
	deleteAddressbook(state, addressbook) {
		state.addressbooks.splice(state.addressbooks.indexOf(addressbook), 1)
	},

	/**
	 * Toggle whether a Addressbook is Enabled
	 * @param {Object} context the store mutations
	 * @param {Object} addressbook the addressbook to toggle
	 */
	toggleAddressbookEnabled(context, addressbook) {
		addressbook = state.addressbooks.find(search => search.id === addressbook.id)
		addressbook.enabled = !addressbook.enabled
	},

	/**
	 * Rename a Addressbook
	 * @param {Object} context the store mutations
	 * @param {Object} data destructuring object
	 * @param {Object} data.addressbook the addressbook to rename
	 * @param {String} data.newName the new name of the addressbook
	 */
	renameAddressbook(context, { addressbook, newName }) {
		addressbook = state.addressbooks.find(search => search.id === addressbook.id)
		addressbook.displayName = newName
	},

	/**
	 * Append a list of contacts to an addressbook
	 * and remove duplicates
	 *
	 * @param {Object} state the store data
	 * @param {Object} data destructuring object
	 * @param {Object} data.addressbook the addressbook to add the contacts to
	 * @param {Contact[]} data.contacts array of contacts to append
	 */
	appendContactsToAddressbook(state, { addressbook, contacts }) {
		addressbook = state.addressbooks.find(search => search === addressbook)

		// convert list into an array and remove duplicate
		addressbook.contacts = contacts.reduce((list, contact) => {
			if (list[contact.uid]) {
				console.debug('Duplicate contact overrided', list[contact.uid], contact)
			}
			Vue.set(list, contact.uid, contact)
			return list
		}, addressbook.contacts)
	},

	/**
	 * Add a contact to an addressbook and overwrite if duplicate uid
	 *
	 * @param {Object} state the store data
	 * @param {Contact} contact the contact to add
	 */
	addContactToAddressbook(state, contact) {
		let addressbook = state.addressbooks.find(search => search.id === contact.addressbook.id)
		Vue.set(addressbook.contacts, contact.uid, contact)
	},

	/**
	 * Delete a contact in a specified addressbook
	 *
	 * @param {Object} state the store data
	 * @param {Contact} contact the contact to delete
	 */
	deleteContactFromAddressbook(state, contact) {
		let addressbook = state.addressbooks.find(search => search.id === contact.addressbook.id)
		Vue.delete(addressbook, contact.uid)
	},

	/**
	 * Share addressbook with a user or group
	 *
	 * @param {Object} state the store data
	 * @param {Object} data destructuring object
	 * @param {Object} data.addressbook the addressbook
	 * @param {string} data.sharee the sharee
	 * @param {string} data.id id
	 * @param {Boolean} data.group group
	 */
	shareAddressbook(state, { addressbook, sharee, id, group }) {
		addressbook = state.addressbooks.find(search => search.id === addressbook.id)
		let newSharee = {
			displayname: sharee,
			id,
			writeable: false,
			group
		}
		addressbook.shares.push(newSharee)
	},

	/**
	 * Remove Sharee from addressbook shares list
	 *
	 * @param {Object} state the store data
	 * @param {Object} sharee the sharee
	 */
	removeSharee(state, sharee) {
		let addressbook = state.addressbooks.find(search => {
			for (let i in search.shares) {
				if (search.shares[i] === sharee) {
					return true
				}
			}
		})
		addressbook.shares.splice(addressbook.shares.indexOf(sharee), 1)
	},

	/**
	 * Toggle sharee's writable permission
	 *
	 * @param {Object} state the store data
	 * @param {Object} sharee the sharee
	 */
	updateShareeWritable(state, sharee) {
		let addressbook = state.addressbooks.find(search => {
			for (let i in search.shares) {
				if (search.shares[i] === sharee) {
					return true
				}
			}
		})
		sharee = addressbook.shares.find(search => search === sharee)
		sharee.writeable = !sharee.writeable
	}

}

const getters = {
	getAddressbooks: state => state.addressbooks
}

const actions = {

	/**
	 * Retrieve and commit addressbooks
	 *
	 * @param {Object} context the store mutations
	 * @returns {Promise<Array>} the addressbooks
	 */
	async getAddressbooks(context) {
		let addressbooks = await client.addressBookHomes[0].findAllAddressBooks()
			.then(addressbooks => {
				return addressbooks.map(addressbook => {
					return mapDavCollectionToAddressbook(addressbook)
				})
			})

		addressbooks.forEach(addressbook => {
			context.commit('addAddressbook', addressbook)
		})

		return addressbooks
	},

	/**
	 * Append a new address book to array of existing address books
	 *
	 * @param {Object} context the store mutations
	 * @param {Object} addressbook The address book to append
	 * @returns {Promise}
	 */
	async appendAddressbook(context, addressbook) {
		return client.addressBookHomes[0].createAddressBookCollection(addressbook.displayName)
			.then((response) => {
				addressbook = mapDavCollectionToAddressbook(response)
				context.commit('addAddressbook', addressbook)
			})
			.catch((error) => { throw error })
	},

	/**
	 * Delete Addressbook
	 * @param {Object} context the store mutations Current context
	 * @param {Object} addressbook the addressbool to delete
	 * @returns {Promise}
	 */
	async deleteAddressbook(context, addressbook) {
		return addressbook.dav.delete().then((response) => context.commit('deleteAddressbook', addressbook))
			.catch((error) => { throw error })
	},

	/**
	 * Toggle whether a Addressbook is Enabled
	 * @param {Object} context the store mutations Current context
	 * @param {Object} addressbook the addressbook to toggle
	 * @returns {Promise}
	 */
	async toggleAddressbookEnabled(context, addressbook) {
		addressbook.dav.enabled = !addressbook.dav.enabled
		return addressbook.dav.update()
			.then((response) => context.commit('toggleAddressbookEnabled', addressbook))
			.catch((error) => { throw error })
	},

	/**
	 * Rename a Addressbook
	 * @param {Object} context the store mutations Current context
	 * @param {Object} data.addressbook the addressbook to rename
	 * @param {String} data.newName the new name of the addressbook
	 * @returns {Promise}
	 */
	async renameAddressbook(context, { addressbook, newName }) {
		addressbook.dav.displayname = newName
		return addressbook.dav.update()
			.then((response) => context.commit('renameAddressbook', { addressbook, newName }))
			.catch((error) => { throw error })
	},

	/**
	 * Retrieve the contacts of the specified addressbook
	 * and commit the results
	 *
	 * @param {Object} context the store mutations
	 * @param {Object} importDetails = { vcf, addressbook }
	 * @returns {Promise}
	 */
	async getContactsFromAddressBook(context, { addressbook }) {
		return addressbook.dav.findAllAndFilterBySimpleProperties(['EMAIL', 'UID', 'CATEGORIES', 'FN', 'ORG'])
			.then((response) => {
				// We don't want to lose the url information
				// so we need to parse one by one
				const contacts = response.map(item => {
					let contact = new Contact(item.data, addressbook, item.url, item.etag)
					contact.dav = item
					return contact
				})
				context.commit('appendContactsToAddressbook', { addressbook, contacts })
				context.commit('appendContacts', contacts)
				context.commit('extractGroupsFromContacts', contacts)
				context.commit('sortContacts')
				return contacts
			})
			.catch((error) => {
				// unrecoverable error, if no contacts were loaded,
				// remove the addressbook
				// TODO: create a failed addressbook state and show that there was an issue?
				context.commit('deleteAddressbook', addressbook)
				console.error(error)
			})
	},

	/**
	 *
	 * @param {Object} context the store mutations
	 * @param {Object} importDetails = { vcf, addressbook }
	 */
	async importContactsIntoAddressbook(context, { vcf, addressbook }) {
		const contacts = parseVcf(vcf, addressbook)
		context.commit('changeStage', 'importing')

		// max simultaneous requests
		const limit = pLimit(3)
		const requests = []

		// create the array of requests to send
		contacts.map(async contact => {
			// Get vcard string
			try {
				let vData = ICAL.stringify(contact.vCard.jCal)
				// push contact to server and use limit
				requests.push(limit(() => contact.addressbook.dav.createVCard(vData)
					.then((response) => {
						// success, update store
						context.commit('addContact', contact)
						context.commit('addContactToAddressbook', contact)
						context.commit('extractGroupsFromContacts', [contact])
						context.commit('incrementAccepted')
					})
					.catch((error) => {
						// error
						context.commit('incrementDenied')
						console.error(error)
					})
				))
			} catch (e) {
				context.commit('incrementDenied')
			}
		})

		Promise.all(requests).then(() => {
			context.commit('changeStage', 'default')
		})
	},

	/**
	 * Remove sharee from Addressbook
	 * @param {Object} context the store mutations Current context
	 * @param {Object} sharee Addressbook sharee object
	 */
	removeSharee(context, sharee) {
		context.commit('removeSharee', sharee)
	},

	/**
	 * Toggle permissions of Addressbook Sharees writeable rights
	 * @param {Object} context the store mutations Current context
	 * @param {Object} sharee Addressbook sharee object
	 */
	toggleShareeWritable(context, sharee) {
		context.commit('updateShareeWritable', sharee)
	},

	/**
	 * Share Adressbook with User or Group
	 * @param {Object} context the store mutations Current context
	 * @param {Object} data.addressbook the addressbook
	 * @param {String} data.sharee the sharee
	 * @param {Boolean} data.id id
	 * @param {Boolean} data.group group
	 */
	shareAddressbook(context, { addressbook, sharee, id, group }) {
		// Share addressbook with entered group or user
		context.commit('shareAddressbook', { addressbook, sharee, id, group })
	},

	/**
	 * Move a contact to the provided addressbook
	 *
	 * @param {Object} context the store mutations
	 * @param {Object} data destructuring object
	 * @param {Contact} data.contact the contact to move
	 * @param {Object} data.addressbook the addressbook to move the contact to
	 */
	async moveContactToAddressbook(context, { contact, addressbook }) {
		// only local move if the contact doesn't exists on the server
		if (contact.dav) {
			await contact.dav.move(addressbook.dav)
				.catch((error) => {
					console.error(error)
					OC.Notification.showTemporary(t('contacts', 'An error occurred'))
				})
		}
		await context.commit('deleteContactFromAddressbook', contact)
		await context.commit('updateContactAddressbook', { contact, addressbook })
		await context.commit('addContactToAddressbook', contact)
	}
}

export default { state, mutations, getters, actions }

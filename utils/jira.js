const JiraClient = require('jira-client')
const fetch = require('node-fetch')
const core = require('@actions/core')
const { parseChangelogForJiraTickets } = require('./jira-helper')
const { jiraHost, packageName, today, parseForWord, parseForVersion } = require('./jira-helper')

const options = {
  username: process.env.JIRA_USERNAME || core.getInput('jiraUsername'),
  token: process.env.JIRA_TOKEN || core.getInput('jiraToken'),
  host: jiraHost,
}

const webhookUrl = process.env.JIRA_WEBHOOK_URL || core.getInput('webhookUrl');

const jira = new JiraClient({
  protocol: 'https',
  host: options.host,
  username: options.username,
  password: options.token,
  apiVersion: '2',
  strictSSL: false,
})

const fetchHeader = {
  Authorization: `Basic ${Buffer.from(`${options.username}:${options.token}`).toString('base64')}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

/**
 * Get Jira Issue
 * @param {String} issueNumber
 * @returns Object object response || error & status code
 */
function getIssue(issueNumber) {
  return jira
    .findIssue(issueNumber)
    .then((response) => console.log(response))
    .catch((err) => console.log(`${err}`))
}

/**
 * Get Jira version
 * @param {String} project
 * @returns {Object} object response || error & status code
 */
function getVersion(version) {
  return jira
    .getVersion(version)
    .then((response) => console.log(response))
    .catch((err) => console.log(`${err}`))
}

/**
 * Get Jira release versions
 * @param {String} project
 * @returns {Object} Object response || error & status code
 */
function getVersions(project) {
  return jira
    .getVersions(project)
    .then((response) => console.log(response))
    .catch((err) => console.log(`${err}`))
}

/**
 * Get a project Id by Project Key
 * @param {String} key Jira Project Key (i.e JIRAFY)
 * @returns {String} A given jira key's corresponding project id
 */
function getProjectIdByKey(key) {
  return jira
    .getProject(key.toUpperCase())
    .then((response) => {
      return response.id
    })
    .catch((err) => {
      console.log(`${err}`)
      return err
    })
}

/**
 * Get a project name by jira ticket name
 * @param {String} ticket Parses Jira project name from jira ticket name
 * @returns {Array} Parsed project name
 */
function getProjectNameByTicket(ticket) {
  return parseForWord(ticket)
}

/**
 * Creates a release version
 * @param {Boolean} archived
 * @param {String} releaseDate
 * @param {String} name
 * @param {String} description
 * @param {String} projectId
 * @param {Boolean} released
 * @returns {object} Success response || error & status code
 */
async function createVersion(archived, releaseDate, name, description, projectId, released) {
  const version = {
    archived: archived || false,
    releaseDate: releaseDate || today(),
    name: name || 'Unnamed',
    description: description || 'An excellent version',
    projectId: projectId,
    released: released || false,
  }

  return jira
    .createVersion(version)
    .then((response) => console.log(response))
    .catch((err) => console.log(`${err}`))
}

/**
 * Set Jira issue properties
 * @param {String} issueId
 * @param {String} issueUpdate
 * @returns {object} Success response || error & status code
 */
async function setIssueProperties(issueId, issueUpdate) {
  const bodyData = typeof issueUpdate === 'string' ? issueUpdate : JSON.stringify(issueUpdate)
  return await fetch(`https://${options.host}/rest/api/2/issue/${issueId}`, {
    method: 'PUT',
    headers: fetchHeader,
    body: bodyData,
  })
    .then((response) => {
      console.log(response)
      return response
    })
    .catch((err) => console.log(err))
}

async function sendWebHookRequest(version, issues) {
  const body = `{"issues": ${issues}, "version": "${version}}`
  return await fetch(webhookUrl, {
    method: 'POST',
    headers: fetchHeader,
    body: body,
  }).then((response) => {
    console.log(response)
    return response
  }).catch((err) => console.log(err))
}

/**
 *
 * @param {String} changelog Changelog
 * @param {String} version Release version
 */
async function createVersionAndUpdateFixVersions(changelog, version) {
  const tickets = parseChangelogForJiraTickets(changelog)
  // Remove duplicate projects
  const projects = [...new Set(getProjectNameByTicket(tickets))]
  version = parseForVersion(version)

  console.log('\x1b[32m%s\x1b[0m', `Projects are: ${projects}`)
  console.log('\x1b[32m%s\x1b[0m', `Tickets are: ${tickets}`)

  try {
    const ticketsId = tickets.map((ticket) => `"${ticket}"`)
    await sendWebHookRequest(version, ticketsId)

    // Create a jira version for each project
    // projects.forEach(async (project) => {
    //   console.log('\x1b[32m%s\x1b[0m', `Attempting to create Jira version: ${version} in project: ${project}`)

    //   var projectId = await getProjectIdByKey(project)

    //   // Adding a hyperlink to version/release repo isn't supported, see https://community.atlassian.com/t5/Jira-discussions/Adding-a-confluence-link-in-a-Release-Version-description-field/td-p/622193
    //   // await createVersion(false, today(), version, `Auto-generated by ${packageName}`, projectId, false)

    //   // Set the fix version for each Jira ticket, linking it the jira version
    //   const issueProperties = `{"update":{"fixVersions":[{"set":[{"name":"${version}"}]}]}}`
    //   tickets.forEach(async (ticket) => {
    //     console.log('\x1b[32m%s\x1b[0m', `Attempting to set fix version: ${version} for ticket: ${ticket}`)
    //     await setIssueProperties(ticket, JSON.parse(issueProperties))
    //   })
    // })
  } catch (err) {
    console.log(err)
  }
}

module.exports = {
  getIssue,
  getVersion,
  getVersions,
  createVersion,
  setIssueProperties,
  createVersionAndUpdateFixVersions,
  getProjectNameByTicket,
  getProjectIdByKey,
}

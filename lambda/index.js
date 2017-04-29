const packageInfo = require('../package.json')
const WebSocket = require('ws')
import Client from 'bazaar-client/dist/client.js'

if (process.argv.length < 4) {
    console.log('')
    console.log('  Usage: node index.js <BazaarJWT> <Action>')
    console.log('')
    console.log('     BazaarJWT     : Admin JWT for Bazaar installation')
    console.log('     Action        : sync|assign|unassign|poll|message')
    console.log('')
    process.exit(-1)
}

const getCollectionName = (collectionName, eventID) => {
    return featureName + '_' + eventID.replace(/-/g, '') + '_' + collectionName
}

const getUserID = (eventID, emailAddress) => {
    return eventID + '_' + crypto.createHash('md5').update(emailAddress).digest('hex')
}

const bazaarJWT = process.argv[2]
const action = process.argv[3]
const isSandboxed = false

const options = {
    skipShim: true,
    isSandboxed: isSandboxed,
    eventID: '',
    featureName: packageInfo.name,
    horizonHost: isSandboxed ? 'localhost:7171' : 'bazaar.doubledutch.me',
    token: bazaarJWT,
    webSocketCtor: WebSocket
}

const api = new Client({}, options)
api.connect().then((user) => {
    console.log('connected: ' + JSON.stringify(user))

    if (action === 'assign') {
        if (process.argv.length < 6) {
            console.log('')
            console.log('  Usage: node index.js <BazaarJWT> assign <EmployeeEmail> <ContactEmail>')
            console.log('')
            console.log('     BazaarJWT     : Admin JWT for Bazaar installation')
            console.log('     Action        : assign')
            console.log('     EmployeeEmail : email@of.employee')
            console.log('     ContactEmail  : email@of.contact')
            console.log('')
            process.exit(-1)
        }

        const employeeEmail = process.argv[4]
        const contactEmail = process.argv[5]

        const user_id = api.getUserIDFromEmail(employeeEmail)
        const target_id = api.getUserIDFromEmail(contactEmail)
        const id = api.getUserIDFromEmail(employeeEmail + '_' + contactEmail)

        console.log('Writing assignment')
        api.insertIntoCollection('assignments', {
            id: id,
            user_id: user_id,
            target_id: target_id,
            owner_ids: [user_id, target_id],
            first_name: 'Nicholas',
            last_name: 'Clark'
        }).subscribe((results, err) => {
            console.log('Fetching all assignments for target')
            api.getCollection('assignments').findAll({ target_id: target_id }).fetch().subscribe((results, err) => {
                const targetAssigneeIDs = results.map((r) => r.user_id)

                console.log('Fetching group for target')
                api.getCollection('groups').findAll({ id: target_id }).fetch().subscribe((groups, err) => {
                    var group
                    if (groups.length) {
                        group = groups[0]
                    } else {
                        group = {
                            id: target_id,
                            created: new Date().toISOString()
                        }
                    }

                    group.target_id = target_id
                    group.owner_ids = targetAssigneeIDs.concat([target_id])

                    console.log('Creating/updating group for target')
                    api.getCollection('groups').store(group).subscribe((res, err) => {
                        console.log(res)
                        console.log(err)
                        process.exit(0)
                    })
                })
            })
        })
    } else if (action === 'poll') {
    } else if (action === 'message') {
    } else if (action === 'sync') {
        if (process.argv.length < 8) {
            console.log('')
            console.log('  Usage: node index.js <BazaarJWT> sync <RatingsHost> <RatingsPort> <RatingsUser> <RatingsPass>')
            console.log('')
            console.log('     BazaarJWT     : Admin JWT for Bazaar installation')
            console.log('     Action        : assign')
            console.log('     EmployeeEmail : email@of.employee')
            console.log('     ContactEmail  : email@of.contact')
            console.log('')
            process.exit(-1)
        }

        const host = process.argv[4]
        const port = process.argv[5]
        const username = process.argv[6]
        const password = process.argv[7]

        const pg = require('pg')
        pg.types.setTypeParser(1114, str => new Date(str.replace(' ', 'T') + 'Z'))

        const client = new pg.Pool({
            user: username, //env var: PGUSER
            database: 'ratings', //env var: PGDATABASE
            password: password, //env var: PGPASSWORD
            host: host, // Server hosting the postgres database
            port: port
        })

        const auth_client = new pg.Pool({
            user: username, //env var: PGUSER
            database: 'authdb', //env var: PGDATABASE
            password: password, //env var: PGPASSWORD
            host: host, // Server hosting the postgres database
            port: port
        })

        // connect to our database
        const user_promise = new Promise((resolve, reject) => {
            client.connect(function (err) {
                if (err) throw err

                const user_query = `
                    select userid, firstname, lastname, title, company, emailaddress, externalimageid from dbo.userdetails ud
                    inner join dbo.globaluserdetails gd on gd.globaluserid = ud.globaluserid
                    where applicationid = $1::uuid and ud.isdisabled = 'f' and gd.isdisabled = 'f'`

                // execute a query on our database
                client.query(user_query, [user.eventID], function (err, result) {
                    if (err) throw err;

                    const documents = result.rows.map((r) => ({
                        id: api.getUserIDFromEmail(r.emailaddress),
                        dd_user_id: r.userid,
                        first_name: r.firstname,
                        last_name: r.lastname,
                        title: r.title,
                        company: r.company,
                        email: r.emailaddress,
                        image_url: r.externalimageid ? `https://d2dstwi4brf1pu.cloudfront.net/${r.externalimageid}-S110x110.jpg` : ''
                    }))

                    console.log('Syncing ' + documents.length + ' users')
                    api.upsertInCollection('users', ...documents).subscribe((results, err) => {
                        console.log('Done with user_info')
                        resolve()
                    })
                })
            })
        })

        const event_promise = new Promise((resolve, reject) => {
            auth_client.connect(function (err) {
                if (err) throw err


                // https://d27z76th86wcg3.cloudfront.net/
                const event_info_query = `
                        select applicationid, name, startdate, enddate,
                            (select files from dbo.applicationsettings where applicationid = applications.applicationid and enabletypeid = 3 limit 1) as icon_url,
                            (select sessiontokenid from dbo.sessiontokens where applicationid = applications.applicationid and isdisabled = 'f' limit 1) as session_token
                        from dbo.applications where applicationid = $1::uuid`

                // execute a query on our database
                auth_client.query(event_info_query, [user.eventID], function (err, result) {
                    if (err) throw err
                    // disconnect the client
                    client.end(function (err) {
                        if (err) throw err
                    })
                    const documents = result.rows.map((r) => ({
                        id: r.applicationid,
                        name: r.name,
                        start_date: r.startdate,
                        end_date: r.enddate,
                        state: {},
                        session_token: r.session_token,
                        icon_url: r.icon_url ? `https://d27z76th86wcg3.cloudfront.net/${r.icon_url}` : ''
                    }))[0]

                    console.log('Syncing ' + documents.length + ' event_info')
                    api.upsertInCollection('event_info', documents).subscribe((results, err) => {
                        console.log('Done with event_info')
                        resolve()
                    })
                })
            })
        })

        Promise.all([user_promise, event_promise]).then(() => {
            process.exit(0)
        })
    }
}).catch((err) => {
    console.log('Error: ' + err)
})
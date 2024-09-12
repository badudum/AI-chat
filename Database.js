/*
 * CPEN 322 Assignment 6
 * Team Pookie Bears
 * David Lee, Felix Ma
 * April 8, 2024
 */


const { MongoClient, ObjectId } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v6.3 - [API Documentation](http://mongodb.github.io/node-mongodb-native/6.3/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen322 app.
 */

/* 
 * Database structure:
 *     -> cpen322-messenger
 *            -> chatrooms -> stores a chatrooms with {_id, name, image, isAdventure, thread}
 *            -> conversations -> stores conversations with {_id, room_id, timestamp, messages[]}
 *            -> users -> stores users with {_id, username, password}
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		const client = new MongoClient(mongoUrl);

		client.connect() 
		.then(() => {
			console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
			resolve(client.db(dbName));
		}, reject);
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

/* 
 * We return a list of rooms from the database
 */
Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			db.collection('chatrooms').find().toArray()
			.then(rooms => {
    			const mappedRooms = rooms.map(room => (
					{
						_id: room._id,
						name: room.name,
						image: room.image
					}
				));
    			resolve(mappedRooms);
			})
			.catch(err => reject(err));
					
		})
	)
}

/* 
 * We return the room with the given room_id from the database
 * We first check to see whether the input is of type ObjectId; if not, we create a new ObjectId
 */
Database.prototype.getRoom = function(room_id) {
    return this.connected.then(db => 
        new Promise((resolve, reject) => {
            let queryId;
            try {
                queryId = (typeof room_id === 'string' || room_id instanceof String) ? new ObjectId(room_id) : room_id;
            } catch (e) {
                queryId = room_id;
            }

            db.collection('chatrooms').findOne({ _id: queryId })
                .then(room => {
                    resolve(room);
                })
                .catch(err => {
                    reject(err);
                });
        })
    );
};

/* 
 * We add a new room to the database
 */
Database.prototype.addRoom = function(room) {
    return this.connected.then(db => 
        new Promise((resolve, reject) => {
            // Check for a name
            if (!room.name) {
                reject(new Error("The 'name' field is required."));
                return;
            }

            db.collection('chatrooms').insertOne(room)
                .then(result => {
                    const insertedId = result.insertedId;
                    resolve({
                        ...room,
                        _id: insertedId
                    });
                })
                .catch(err => reject(err));
        })
    );
}

/* 
 * We get te last conversation from the database
 */
Database.prototype.getLastConversation = function(room_id, before){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {

			const queryBefore = before || Date.now();

            // Construct the MongoDB query
            const query = { 
                room_id: room_id, 
                timestamp: { $lt: queryBefore } 
            };

            // Find and sort conversations (newest first)
            db.collection('conversations')
                .find(query)
                .sort({ timestamp: -1 }) // -1 indicates sort descending by timestamp
                .limit(1) 
                .toArray()
                .then(results => {
                    const conversation = results.length > 0 ? results[0] : null;
                    resolve(conversation);
                })
                .catch(err => reject(err));
		})
	)
}

/* 
 * Add a conversation to the database
 */
Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if (!conversation.room_id || !conversation.timestamp || !conversation.messages) {
                reject(new Error("Missing fields: 'room_id', 'timestamp', and 'messages' are required."));
                return; 
            }
			
            db.collection('conversations').insertOne(conversation)
                .then(result => {
                    resolve(conversation); 
                })
                .catch(err => reject(err));

		})
	)
}

/*
 * Check whether a user exists in the database 
 */
Database.prototype.getUser = function(username) {
    return this.connected.then(db =>
        new Promise((resolve, reject) => {
            db.collection('users').findOne({ username: username })
                .then(user => {
                    if (!user) {
                        console.log("THIS IS THE USERNAME", username);
                        console.log("NO USER FOUND");
                        resolve(null);
                    } else {
                        resolve(user);
                    }
                })
                .catch(err => {
                    reject(err);
                });
        })
    );
};

/* 
 * Updates the given room's isAdventure field with the passed in boolean value 
 */
Database.prototype.updateAdventure = function(isAdventure, room_id) {
    let queryId;
    try {
        queryId = (typeof room_id === 'string' || room_id instanceof String) ? new ObjectId(room_id) : room_id;
    } catch (e) {
        queryId = room_id;
    }

    return this.connected.then( db =>
        new Promise((resolve,reject) => {
            db.collection('chatrooms').updateOne(
                {"_id" : queryId}, 
                {$set : { "isAdventure" : isAdventure }}
            )
            .then(result => resolve(result))
            .catch(result => reject(result));
        })
    );
};

/* 
 * Updates the given room's thread with the passed in thread 
 */
Database.prototype.updateThread = function(room_id, thread){
    console.log("WE ARE UPDATING THREAD");

    let queryId;
    try {
        queryId = (typeof room_id === 'string' || room_id instanceof String) ? new ObjectId(room_id) : room_id;
    } catch (e) {
        queryId = room_id;
    }

    return this.connected.then(db => 
        new Promise((resolve,reject) => {
            db.collection('chatrooms').updateOne(
                {'_id' : queryId},
                {$set : {'thread' : thread}}
            )
            .then(result=>resolve(result))
            .catch(result=> reject(result));
        }))
}

module.exports = Database;
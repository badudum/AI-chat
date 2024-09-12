/*
 * CPEN 322 Assignment 6
 * Team Pookie Bears
 * David Lee, Felix Ma
 * April 8, 2024
 */

/* 
 * Import the required structures from the openai API
 * For setup instructions, please see the read me file
 * Put the given API key here
 */
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: '' });

/* 
 * getGPTResponse asynchronously fetches a response from the GPT model based on a given message
 * and a given thread
 * The model retrieved here is a custom model whose purpose is to handle choose-your-own-adventure
 * stories
 * We pass in the thread and the prompt; the thread lets the assistant know the context of the conversation
 * and how to generate a story prompt based on the incoming message, in this case this incoming message
 * will only ever be 1, 2, 3, or 4
 */
async function getGPTResponse(message, thread) {

    try {const myAssistant = await openai.beta.assistants.retrieve(
            "asst_Aoiyb5UkzzIO3aWSoGhvwlPo"
        );

        const messageToSend = await openai.beta.threads.messages.create(
            thread.id,
            {
              role: "user",
              content: message
            }
        );

        console.log("trying to run the thread");
        let run = await openai.beta.threads.runs.createAndPoll(
            thread.id,
            { 
              assistant_id: myAssistant.id,
            }
        );

        if (run.status === 'completed') {
            const messages = await openai.beta.threads.messages.list(
              run.thread_id
            );
            return messages.data[0].content[0].text.value;
          } else {
            console.log("There was an error, run status was not completed");
            console.log(run.status);
        }
    } catch (error) {
        console.error("Error getting response from OpenAI:", error);
        return "Sorry, I encountered an error.";
    }
}

/*
 * Declare all the variables we will need for our serverside logic, including database and socket 
 */
const Database = require('./Database.js');
const db = new Database('mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.1.5', 'cpen322-messenger');
const SessionManager = require('./SessionManager.js');
const sessionManager = new SessionManager();
const crypto = require('crypto');
const messageBlockSize = 1;
const WebSocket = require('ws');
const broker = new WebSocket.Server({ port: 8000 });
const path = require('path');
const express = require('express');


function logRequest(req, res, next) {
    console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
    next();
} 

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');

/* 
 * Used for sanitizing user input to prevent against XSS attacks
 * Function taken from Stack Overflow
 * https://stackoverflow.com/questions/2794137/sanitizing-user-input-before-adding-it-to-the-dom-in-javascript
 */
const sanitize = function(string) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    };  
    return string.replace(/[&<>]/ig, (match)=>(map[match]));
};

/* 
 * Initialize the express app and configure our middleware
 */
let app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logRequest);

/*
 * Serve static files (client-side) 
 */
app.use((req, res, next) => {
    if (req.path.startsWith('/profile') || ['/', '/app.js', '/index.html', '/index'].includes(req.path)) {
        return sessionManager.middleware(req, res, next);
    } else {
        next();
    }
})
app.use('/', express.static(clientApp, { extensions: ['html'] }));

app.listen(port, () => {
    console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

const cpen322 = require('./cpen322-tester.js');
var chatrooms = db.getRooms();

/*
 * We initialize an empty object to store message for each room by their ID 
 */
var messages = {};
db.getRooms()
    .then(rooms => {
        rooms.forEach(room => {
            messages[room._id] = [];
        });
    })
    .catch(err => console.error(err));

/* 
 * Checks an inputted password to see whether it matches any user's in the database
 */
function isCorrectPassword(password, saltedHash) {
    const salt = saltedHash.substring(0, 20);
    const saltedPassword = password + salt;
    const hash = crypto.createHash('sha256').update(saltedPassword).digest('base64');
    return hash === saltedHash.substring(20);
}

/* 
 * GET endpoint retrives the last conversation from a specific chat room before a given
 * timestamp from the database
 * If a conversation is found, it is returned as a JSON, other wise we send a 404 error
 */
app.get('/chat/:room_id/messages', sessionManager.middleware, (req, res) => {
    const roomId = req.params.room_id;
    const beforeTimestamp = parseInt(req.query.before, 10);
    db.getLastConversation(roomId, beforeTimestamp)
        .then(conversation => {
            if (conversation) {
                res.json(conversation);
            } else {
                res.status(404).send("Conversation not found");
            }
        })
        .catch(err => {
            console.error("Error fetching conversation:", err);
            res.status(500).send("Error fetching conversation"); 
        });
});

/* 
 * GET endpoint gets the information about a spceific chat room based on the given roomId
 * from the database
 * If a room is found, we return it as a JSON, other we send an error 404
 */
app.get('/chat/:room_id', sessionManager.middleware, (req, res) => {
    const roomId = req.params.room_id;

    db.getRoom(roomId).then(room => {
        if (room) {
            res.json(room);
        } else {
            res.status(404).send(`Room ${roomId} was not found`);
        }
    }).catch(error => {
        console.error(error);
        res.status(500).send('An error occurred while fetching the room');
    });
});

/* 
 * GET endpoint gives a list of all chat rooms, retrieving from the database
 * If rooms are retrieved, they are returned as a JSON array, otherwise we send
 * an error
 */
app.get('/chat', sessionManager.middleware, (req, res) => {
    
    db.getRooms().then(rooms => {
        const chatroomsWithMessages = rooms.map(room => {
            return Object.assign({}, room, { messages: messages[room._id] });
        });
        res.json(chatroomsWithMessages);
    }).catch(error => {
        console.log("ERROR IN FETCHING MESSAGES");
    });
});


/* 
 * POST endpoint handles the creation of a new chat room
 * We add the new room to the database using the information passed in the request body
 * If successful, we give status 200, otherwise we give status 500
 */
app.post('/chat', sessionManager.middleware, (req, res) => {
    const data = req.body;

    if (!data.name) {
        return res.status(400).send('Name field is required');
    }

    const newRoom = {
        name: data.name,
        image: data.image,
    };

    db.addRoom(newRoom).then(addedRoom => {
        messages[addedRoom._id] = [];
        res.status(200).json(addedRoom);
    }).catch(err => {
        console.error(err);
        res.status(500).send('An error occurred while creating the room');
    });
});

/* 
 * GET endpoint retrives the profile information of the authenticated user
 * We return the username as a JSON if successful, otherise we return status 500 
 */
app.get('/profile', sessionManager.middleware, (req, res) => {
    if (req.username) {
        return res.json({username: req.username});
    } else {
        res.status(500).send('An error occurred while accessing profile');
    }
});


/* 
 * POST endpoint for /login handles user login requests
 * If the user does not exist, we go back to the login page
 * Otherwise, we verify their username and password using isCorrectPassword
 */
app.post('/login', (req, res) => {
    db.getUser(req.body.username).then(user => {
        if (!user) {
            return res.redirect('/login');
        }

        if (isCorrectPassword(req.body.password, user.password)) {
            const token = sessionManager.createSession(res, req.body.username);
            res.redirect('/');
        } else {
            return res.redirect('/login');
        }

    }).catch(err => {
        console.error("LOGIN ERROR:", err);
        res.status(500).send("THERE HAS BEEN AN ERROR");
    });
});

/* 
 * GET endpoint handles logout, deleting the session and sending the user back to login page 
 */
app.get('/logout', (req, res) => {
    sessionManager.deleteSession(req);
    return res.redirect('/login');
});

/*
 * Handle the error thrown by the middleware
 */
app.use((err, req, res, next) => {
    if (err instanceof SessionManager.Error) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(401).json({ error: err.message });
        } else {
            res.redirect('/login');
        }
    } else {
        res.status(500).send('Not an instance of SessionManager.Error');
    }
});

/* 
 * This POST endpoint interacts with the ChatGPT API based on the user choice
 * The function begins by extracting the user's choice and the correct thread before
 * passing these into the getGPTResponse function and saving it
 * 
 * We then push a new message to the chat containing the response, and send it over the
 * socket so that users may immediately see the response from GPT when it arrives
 */
app.post('/chat/gpt', sessionManager.middleware, async (req, res) => {

    // Get the response from GPT
    const option = req.body.choice;
    const roomId = req.body.roomId;
    const room = await db.getRoom(roomId); 
    const response = await getGPTResponse(option, room.thread);
    console.log("Here is the response from chatgpt: ", response);

    // Push the response to the room
    const systemMessage = { 
        username: "ChatGPT",
        text: response,
        roomState: true
    };

    messages[roomId].push(systemMessage);
    const timestamp = Date.now(); 

    // Save the message into our database
    const newConversation = {
        room_id: roomId,
        timestamp: timestamp,
        messages: messages[roomId]
    };

    db.addConversation(newConversation)
        .then(() => {
            console.log("Conversation saved successfully");
            messages[roomId] = []; 
            res.status(200).json(newConversation);
        })
    .catch(err => {console.error(err);
    res.status(500).send('An error occurred while creating the room');
    });

    broker.clients.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                roomId: roomId,
                ...systemMessage
            }));
        }
    });

});



broker.on('connection', async (clientSocket, request) => {

    // Check if cookie exists and is valid
    if (!request.headers.cookie) {
        console.log("ERROR, NO COOKIE FOUND");
        clientSocket.close();
        return;
    }

    const token = request.headers.cookie.split('=')[1];

    if (!sessionManager.getUsername(token)) {
        console.log("ERROR, INVALID COOKIE");
        console.log("INVALID TOKEN IS: ", token);
        clientSocket.close();
        return; 
    }

    // Wait for a message to be sent from the user
    clientSocket.addEventListener('message', async (event) => {

        // We parse the message data and get the relevant room
        const messageData = JSON.parse(event.data);
        const roomId = messageData.roomId;
        console.log("messageData and roomId ", messageData, roomId);
        const room = await db.getRoom(roomId); 

        // Read the user's message, and perform the corresponding action
        if (roomId && messages.hasOwnProperty(roomId)) {
            messageData.text = sanitize(messageData.text);
            messageData.username = sessionManager.getUsername(token);
            messageData.username = sanitize(messageData.username);

            /* 
             * Here we check whether the user said 'begin adventure'
             * If so, we update the current room's isAdventure to be true before sending the 'Okay, let's begin' message
             */
            if (messageData.text.toLowerCase().trim() === "begin adventure" && room.thread == null) {

                // Handle regular user messages
                messageData.username = sessionManager.getUsername(token);
                messageData.username = sanitize(messageData.username);
                messages[roomId].push({
                    username: messageData.username, 
                    text: messageData.text
                });

                // Create a new thread for this room, context will be saved in this thread
                let thread;
                if (room.thread == null){
                    console.log("WE ARE CREATING A NEW THREAD");
                    thread = await openai.beta.threads.create();
                    await db.updateThread(roomId, thread);
                }
                else {
                    thread = room.thread;
                }
                
                // Create a system message
                const systemMessage = {
                    username: "ChatGPT",
                    text: 
                    `Okay, let's begin, please select the setting you would like: \n
                    1. Medieval Fantasy \n
                    2. 1920's Detective \n
                    3. CyberPunk \n
                    4. Present Day`,
                    roomState: true
                };
            
                // Push the system message to the room's messages and broadcast it to all clients
                messages[roomId].push(systemMessage);

                broker.clients.forEach((socket) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            roomId: roomId,
                            ...systemMessage
                        }));
                    }
                });
                await db.updateAdventure(true, roomId);
                const testRoom = await db.getRoom(roomId);
                console.log("THIS IS TESTROOM: ", testRoom);
                console.log("THIS IS THE ISADVENTURE STATUS, IT SHOULD BE TRUE", testRoom.isAdventure);

            } 
            
            /* 
             * We handle the case where the user is currently in an adventure and says 'end adventure'
             * We create the system message 'Thanks for playing!', and update the room's isAdventure status to be false
             * We also clear the room's thread, so the room may be used again for a new adventure
             */
            else if (messageData.text.toLowerCase().trim() === "end adventure" && room.thread) {

                // Handle message as usual
                messageData.username = sessionManager.getUsername(token);
                messageData.username = sanitize(messageData.username);
                messages[roomId].push({
                    username: messageData.username,
                    text: messageData.text
                });

                // Create a system message
                const systemMessage = {
                    username: "ChatGPT",
                    text: "Thanks for playing!",
                    roomState: false
                };

                // Push the system message to the room's messages and broadcast it to all clients
                messages[roomId].push(systemMessage);
                broker.clients.forEach((socket) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            roomId: roomId,
                            ...systemMessage
                        }));
                    }
                });

                // Set room's thread to null, and isAdventure to false
                await db.updateThread(roomId, null);
                await db.updateAdventure(false, roomId);

            }  else {
                // Handle regular user messages
                messageData.username = sessionManager.getUsername(token);
                messageData.username = sanitize(messageData.username);
                messages[roomId].push({
                    username: messageData.username,
                    text: messageData.text
                });
            }

            // Note that we set messageBlockSize to 1
            if (messages[roomId].length >= messageBlockSize) { 
                const timestamp = Date.now(); 

                const newConversation = {
                    room_id: roomId,
                    timestamp: timestamp,
                    messages: messages[roomId]
                };

                db.addConversation(newConversation)
                    .then(() => {
                        console.log("Conversation saved successfully");
                        messages[roomId] = []; 
                    })
                    .catch(err => console.error("Error saving conversation:", err));
            }

            /*
             * Broadcast the state of the room so user's UIs can update based on whether the room is 
             * currently in an adventure or not
             */
            let temp = await db.getRoom(roomId);
            messageData.roomState = temp.isAdventure;
            broker.clients.forEach((socket) => {
                if (socket !== clientSocket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(messageData));
                }
            });
            
        }
    });
});

/* 
 * GET endpoint returns the state of the given room, i.e. whether or not an adventure is currently happening
 */
app.get('/getStat', sessionManager.middleware, async(req, res) => {
    const roomId = req.body.roomId;
    const room = await db.getRoom(roomId);
    return res.json(room.isAdventure);
});

cpen322.connect('http://3.98.223.41/cpen322/test-a5-server.js');
cpen322.export(__filename, { app, messages, chatrooms, broker, db, WebSocket, messageBlockSize, sessionManager, isCorrectPassword}	);
/*
 * CPEN 322 Assignment 6
 * Team Pookie Bears
 * David Lee, Felix Ma
 * April 8, 2024
 */

/*
 * getNewRoomId() and uuidv4 work together to generate and deliver a unique id for each room
 * uuidv4 generates a UUID in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx, with x representing
 * hexadecimal digits and y with random hex digits with most significant bits = '10xx'
 * The uuidv4 function was largely taken from this stackoverflow thread:
 * https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
 */

function getNewRoomId() {
    return uuidv4();
}

function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c == "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}


/*
 * Service acts as an interface that faciliates communication with the server
 * As such, Service has functions for fetching all rooms, adding a room, fetching
 * the last conversation, fetching profile, and fetching the isAdventure state of 
 * a room
 * 
 * - getAllRooms() -> retrives list of all chatrooms from server
 * - addRoom(data) -> submits a request to create a new chatroom with the given data
 * - getLastConversation(roomId, before) -> gets most recent conversation in roomId before
 *                                          a given timestamp
 * - getProfile() -> gets the current user's profile
 * - getStat(roomId) -> fetches the state of the current room, to be specific whether or
 *                      not the current room is playing an adventure
 */
var Service = {
    origin: window.location.origin,
  
    // retrives list of all chatrooms from server
    getAllRooms: function() {
        return fetch(this.origin + "/chat")
          .then(response => {
            if (response.ok) {
              return response.json();
            } else {
              return response.text().then(text => Promise.reject(new Error(text)));
            }
          })
          .catch(error => {throw error});
      },

    // submits a request to create a new chatroom with the given data
    addRoom: function(data) {
        return fetch(this.origin + "/chat", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => {
            if (response.ok) {
                return response.json();
            } else {
                return response.text().then(text => Promise.reject(new Error(text)));
            }
        }).catch(error => {throw error});
    },

    // gets most recent conversation in roomId before a given timestamp
    getLastConversation: function(roomId, before) {
        const url = `${this.origin}/chat/${roomId}/messages?before=${before}`;
        return fetch(url) 
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    return response.text().then(text => Promise.reject(new Error(text)));
                }
            })
            .catch(error => { throw error; }); 
    },

    // gets the current user's profile
    getProfile: function() {
        return fetch(this.origin + '/profile')
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    return response.text().then(text => Promise.reject(new Error(text)));
                }
            })
        .catch(error => { throw error; });
    },

    //fetches whether or not the current room is playing an adventure
    getStat : function(roomId) {
        const url = `${this.origin}/chat/${roomId}`;
        return fetch(url) 
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    return response.text().then(text => Promise.reject(new Error(text)));
                }
            })
            .catch(error => { throw error; }); 
    }

  };

  
/*
 * Profile class represents an instance of a user profile
 */
class Profile {
    constructor(username) {
        this.username = username;
    }
}
var profile = new Profile("Dawood");

/*
 * The main function intializes the application, setting up all the views, 
 * socket connections, and event listeners
 * Here the lobby is also refreshed periodically to ensure the chatrooms list
 * remains updated
 * 
 * - renderRoute() -> determines the current URL hash and renders the appropriate view
 * - refreshLobby() -> fetches list of chatrooms and updates lobby view with rooms
 */
function main() {
    const lobby = new Lobby();
    const profileView = new ProfileView();
    const lobbyView = new LobbyView(lobby);
    const socket = new WebSocket('ws://localhost:8000');
    const chatView = new ChatView(socket);

    // determines the current URL hash and renders the appropriate view
    function renderRoute() {
        const path = window.location.hash;
        const pageView = document.getElementById('page-view');
        emptyDOM(pageView);
        if (path.startsWith('#/chat')) {
            pageView.appendChild(chatView.elem);
            const roomId = path.replace("#/chat/", "");
            const curRoom = lobby.getRoom(roomId);
            if (curRoom != null) {
                chatView.setRoom(curRoom);
            }
        } else if (path === '#/') {
            emptyDOM(pageView);
            pageView.appendChild(lobbyView.elem);
        } else if (path === '#/profile') {
            emptyDOM(pageView);
            pageView.appendChild(profileView.elem);
        }
    }

    // fetches list of chatrooms and updates lobby view with rooms
    function refreshLobby() {
        Service.getAllRooms().then(roomsList => {
            roomsList.forEach(roomData => {
                var existingRoom = lobby.getRoom(roomData._id);
                if (existingRoom) {
                    existingRoom.image = roomData.image;
                    existingRoom.name = roomData.name;
                } else {
                    lobby.addRoom(roomData._id, roomData.name, roomData.image, roomData.messages);
                }
            });
        }).catch(error => {
            console.error("Error refreshing the lobby:", error);
        });
    }
    
    /* 
     * We add an event listener to our socket listening for incoming messages
     * 
     * Incoming messages are parsed as JSONs, with fields roomId, username, text, and roomState
     * The received message is parsed, and the message is added to the correct room based
     * on the roomId received
     * 
     * The incoming message's roomState is used to update the room, and we trigger the app to
     * update the adventure UI, i.e. turn on the buttons if there is an adventure going on, turn
     * them off if there is no adventure going on
     */
    socket.addEventListener('message', (event) => {
        const messageData = JSON.parse(event.data);
        const room = lobby.getRoom(messageData.roomId);
        const roomData = messageData.adventure;
        if (room) {
            room.addMessage(messageData.username, messageData.text);
            room.isAdventure = messageData.roomState;
            chatView.updateAdventureUI();
        }
    });
    
    Service.getProfile().then(profileData => {
        if (profileData && profileData.username) {
            profile.username = profileData.username;
        }
    }).catch(err => console.error('Error fetching profile:', err));

    window.addEventListener('popstate', renderRoute);

    renderRoute();
    setInterval(refreshLobby, 5000);
    cpen322.setDefault("testRoomId", "room-1");
    cpen322.setDefault("cookieName", "cpen322-session");
    cpen322.setDefault("testUser1", { username: 'alice', password: 'secret', saltedHash: '1htYvJoddV8mLxq3h7C26/RH2NPMeTDxHIxWn49M/G0wxqh/7Y3cM+kB1Wdjr4I=' });
    cpen322.setDefault("testUser2", { username: 'bob', password: 'password', saltedHash: 'MIYB5u3dFYipaBtCYd9fyhhanQkuW4RkoRTUDLYtwd/IjQvYBgMHL+eoZi3Rzhw=' });
    cpen322.setDefault("webSocketServer", "ws://localhost:8000");
    cpen322.setDefault("image", "assets/everyone-icon.png");
    cpen322.export(arguments.callee, { renderRoute, lobby, profileView, chatView, lobbyView, refreshLobby, socket }); // Export the local variables

}
window.addEventListener('load', main);

/*
 * - emptyDOM(elem) -> takes in a DOM element and removes all its child elements
 */
function emptyDOM(elem) {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

/*
 * - createDOM(htmlString) -> takes in an HTML string and returns the DOM element
 */
function createDOM(htmlString) {
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

/*
 * The LobbyView class takes care of managing and displaying the lobby section of the application
 * Specifically, it handles the UI elements for the lobby including displaying all rooms, the text
 * box and button to add rooms, and all interaction handling for said elements
 * LobbyView uses Service to fetch and post data to the server, updating the list of rooms based on
 * the server's response
 * 
 * - constructor(lobby) -> this is where we set up the HTML of the lobby as well as add event listeners
 *                         for the room list, the text input, and the add room button
 * - redrawList() -> reloads the list of rooms in the current lobby
 */ 
class LobbyView {

    /* 
     * this is where we set up the HTML of the lobby as well as add event listeners for the room list, 
     * the text input, and the add room button
     */ 
    constructor(lobby) {
        this.lobby = lobby;
        this.elem = createDOM(`
        <div id="page-view">
            <div class="content">
                <ul class="room-list"></ul>
                <div class="page-control">
                    <input type="text"></input>
                    <button type="button">Add Room</button>
                </div>
            </div>
        </div>
        `);
        this.listElem = this.elem.querySelector('.room-list');
        this.inputElem = this.elem.querySelector('input');
        this.buttonElem = this.elem.querySelector('button');
        this.buttonElem.addEventListener('click', () => {
            const roomData = {
                name: this.inputElem.value,
                image: "./assets/everyone-icon.png",
                _id: uuidv4()
            };
            Service.addRoom(roomData).then(newRoom => { 
                this.lobby.addRoom(newRoom._id, newRoom.name, newRoom.image, newRoom.messages);
            }).catch(error => {
                console.error("Error adding room:", error);
            });
            emptyDOM(this.inputElem);
        });
        
        this.lobby.onNewRoom = (newRoom) => {
            this.redrawList();
            this.inputElem.value = '';
            emptyDOM(this.inputElem);
        };

        this.redrawList();
    }
    
    // reloads the list of rooms in the current lobby
    redrawList() {
        emptyDOM(this.listElem);
        for (const roomKey in this.lobby.rooms) {
            const room = this.lobby.rooms[roomKey];
            const roomIcon = createDOM(`
            <li>
                <a href="#/chat/${room._id}">
                    <img src="${room.image}">
                    <span>${room.name}</span>
                </a>
            </li>`);
            this.listElem.appendChild(roomIcon);
        }
        
    }
}

/*
 * ChatView manages the user interface for individual chat rooms, including displaying the the correct 
 * messages in a chatroom, sending messages, and updating the chat UI 
 * This class also provides functionality to load previous messages when the user scrolls up
 * 
 * - constructor(socket) -> here we set up the HTML needed for our chatrooms and add event listeners for 
 *                          the different buttons and for scrolling up
 * - updateAdventureUI() -> updates the user interface with adventure-specific options; if in adventure mode,
 *                          we load the option 1, 2, 3, 4 buttons, if not in adventure mode, we remove them
 * - sendMessage() -> takes the text from the input box and sends it to the current room as a message and to
 *                     the server via the WebSocket connection
 * - setRoom(room) -> sets the current room for the chat view, updating room title, messages, and adventure
 *                    buttons if needed
 */
class ChatView {

    /*
     * here we set up the HTML needed for our chatrooms and add event listeners for the different buttons and for 
     * scrolling up
     */
    constructor(socket) {
        this.socket = socket;
        this.elem = createDOM(
            `
            <div class="content">
                    <h4 class="room-name">CHAT PAGE FROM THE CLASS</h4>
                
                    <div class="message-list"></div>

                    <div class="page-control">
                        <textarea></textarea>
                        <button class="button">Send</button>
                    </div>
            </div>
            `
            );
        this.room = null;
        this.titleElem = this.elem.querySelector('.room-name');
        this.chatElem = this.elem.querySelector('.message-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.buttonElem = this.elem.querySelector('button');

        this.adventureButtonContainer = createDOM('<div class="adventure-buttons"></div>');
        this.elem.appendChild(this.adventureButtonContainer);

        this.buttonElem.addEventListener('click', () => {
            this.sendMessage();
        }); 

        this.inputElem.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                this.sendMessage();
            }
        })

        this.chatElem.addEventListener('wheel', (event) => {
            if (this.chatElem.scrollTop === 0 && event.deltaY < 0 && this.room.canLoadConversation) {
                this.room.getLastConversation.next();
            }
        });

        
    }

    /* 
     * updates the user interface with adventure-specific options; if in adventure mode,
     * we load the option 1, 2, 3, 4 buttons, if not in adventure mode, we remove them
     */
    updateAdventureUI() {
        this.adventureButtonContainer.innerHTML = '';

        if (this.room && this.room.isAdventure) {
            const buttonTitles = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
            buttonTitles.forEach((title, index) => {
                const button = document.createElement('button');
                button.textContent = title;

                button.addEventListener('click', async () => {
                    console.log(`${title} clicked`);
                    const optionText = (index + 1).toString();

                    try {
                            const response = await(fetch('/chat/gpt', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    choice: optionText,
                                    roomId: this.room._id
                                })
                            }));
                            if (response.ok) {
                                const data = await response.json();
                                console.log("HERE IS THE GPT RESPONSE: ", data);
                            } else {
                                console.log("ERROR FROM GPT ENDPOINT: ", await response.text());
                            } 
                        } catch (error) {
                            console.error("FAILED TO SENT TO GPT, ", error);
                        }
                });
                
                this.adventureButtonContainer.appendChild(button);
            });
        }
    }
    
    /*
     * takes the text from the input box and sends it to the current room as a message and to
     * the server via the WebSocket connection
     */
    sendMessage() {
        this.room.addMessage(profile.username, this.inputElem.value);
        this.socket.send(JSON.stringify({
            roomId: this.room._id,
            text: this.inputElem.value
        }));


        emptyDOM(this.inputElem);
        this.inputElem.value = ''; 

        // console.log(response);
        // this.room.isAdventure = response;
        this.updateAdventureUI();

    }

    /* 
     * sets the current room for the chat view, updating room title, messages, and adventure
     * buttons if needed
     * 
     * - onNewMessage(message) -> see documentation for the Room class
     * - onFetchConversation(conversation) -> see documentation for the Room class
     */
    async setRoom(room) {
        this.room = room;
        let servRoom = await Service.getStat(room._id);
        this.room.isAdventure = servRoom.isAdventure;
        this.updateAdventureUI();
        this.titleElem.textContent = room.name;
        this.titleElem.appendChild(createDOM(`
        <h4>${room.name}</h4>
        `)); 
        emptyDOM(this.chatElem);

        room.messages.forEach(message => {
            const messageBox = createDOM(`
                <div class="${message.username === profile.username ? "message my-message" : "message"}">
                    <span class="message-user">${message.username}</span>
                    <span class="message-text">${sanitize(message.text)}</span>
                </div>
            `);
            this.chatElem.scrollTop = this.chatElem.scrollHeight;
            this.chatElem.appendChild(messageBox);
        }); 

        this.room.onNewMessage = (message) => {
            const messageBox = createDOM(`
                <div class="${message.username === profile.username ? "message my-message" : "message"}">
                    <span class="message-user">${message.username}</span>
                    <span class="message-text">${sanitize(message.text)}</span>
                </div>
            `);
            this.chatElem.appendChild(messageBox); 
            this.chatElem.scrollTop = this.chatElem.scrollHeight;
        };

        this.room.onFetchConversation = (conversation) => {
            const scrollHeightBefore = this.chatElem.scrollHeight; 
            
            conversation.messages.slice().reverse().forEach(message => {
                console.log("Here is the sanitize(message.text) ", sanitize(message.text));
                const messageBox = createDOM(`
                    <div class="${message.username === profile.username ? "message my-message" : "message"}">
                        <span class="message-user">${message.username}</span>
                        <span class="message-text">${sanitize(message.text)}</span>
                    </div>
                `);

                this.chatElem.insertBefore(messageBox, this.chatElem.firstChild);
            });

            const scrollHeightAfter = this.chatElem.scrollHeight; 
            this.chatElem.scrollTop = scrollHeightAfter - scrollHeightBefore;
        };

        this.titleElem.textContent = room.name;
    }

}

/* 
 * Message class, represents a message with username and text 
 */
class Message {
    constructor(username, text) {
        this.username = username;
        this.text = text;
    }
    
}

/* 
 * ProfileView loads the profile page
 */
class ProfileView {
    constructor() {
        this.elem = createDOM(`          
            <div class="content">
                <div class="profile-form">
                    <div class="form-field">
                        <label>THIS IS THE NEW NEW PROFILE PAGE FROM THE CLASS</label>
                        <input type="text">
                    </div>
                    <div class="form-field">
                        <label>LABEL</label>
                        <input type="password">
                    </div>
                    <div class="form-field">
                        <label>LABEL</label>
                        <input type="file">
                    </div>
                </div>
                <div class="page-control">
                    <button class="button">BUTTON</button>
                </div>
            </div>
        `);
    }
}

/*
 * The Room class represents a chatroom, storing information such as id, name, image, messages, etc.
 * This class handles adding a message to a room and adding a conversation to a room
 * 
 * - addMessage(username, text) -> filters incoming message, passes it to the onNewMessage function
 * - addConversation(conversation) -> sorts the messages in a conversation by time, and passes them
 *                                    to onFetchConversation
 * - onNewMessage(message) -> we load the message the user sends into the page
 * - onFetchConversation(conversation) -> we load the previous conversation and its messages into the page
 */
class Room {
    constructor(_id, name, image = "assets/everyone-icon.png", messages = []) {
        this.id = _id,
        this._id = _id;
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.canLoadConversation = true;
        this.isAdventure = false;
        this.getLastConversation = makeConversationLoader(this);
        this.timestamp = Date.now();
    }

    // filters incoming message, passes it to the onNewMessage function
    addMessage(username, text) {
        if (typeof(text) != 'string') {
            text = text.value;
        }

        if (text === null || username === undefined) {
            return;
        }

        else if (text.trim().length === 0) {
            return;
        }

        const newMessage = new Message(username, text);
        this.messages.push(newMessage);

        if (typeof this.onNewMessage === 'function') {
            this.onNewMessage(newMessage);
        }
    }

    // sorts the messages in a conversation by time, and passes them to onFetchConversation
    addConversation(conversation) {
        if(!conversation){
            return;
        }
        
        this.messages = conversation.messages.concat(this.messages);
        this.messages.sort((a, b) => b.timestamp - a.timestamp);

        if (typeof this.onFetchConversation === 'function') {
            this.onFetchConversation(conversation);
        }
    }
}

/* 
 * Lobby represents the collection of chatrooms in the application, managing the addition and
 * the retrieval of rooms
 * 
 * - getRoom(roomId) -> simply returns the room corresponding to the roomId
 * - addRoom(_id, name, image, messages) -> creates a new room and adds it to rooms
 */
class Lobby {
    constructor() {
        this.rooms = {};
    }

    // simply returns the room corresponding to the roomId
    getRoom(roomId) {
        return this.rooms[roomId];
    }

    // creates a new room and adds it to rooms
    addRoom(_id, name, image, messages) {
        const newRoom = new Room(_id, name, image, messages);
        this.rooms[_id] = newRoom;

        if (typeof this.onNewRoom === 'function') {
            this.onNewRoom(newRoom);
        }
    }
}

/* 
 * This is a generator function respondible for loading conversations in a given room
 * Function yields a promise that resolves with a conversation object or null depending
 * on whether there are more messages to fetch 
 */
function* makeConversationLoader(room) {
    let latestTimestamp = room.timestamp;

    while (room.canLoadConversation) {
        room.canLoadConversation = false;
            yield Service.getLastConversation(room._id, latestTimestamp)
                .then(response  => {
                    if (response) {
                        room.addConversation(response);
                        room.canLoadConversation = true;
                        latestTimestamp = response.timestamp;
                        return response;
                    } else {
                        room.canLoadConversation = false;
                        return;
                    }
                })
                .catch ((error) =>{
                    console.error("Error loading conversation:", error);
                    return null; 
                });
    }
};

/* 
 * Used for sanitizing user input to prevent against XSS attacks
 * Function taken from Stack Overflow
 * https://stackoverflow.com/questions/2794137/sanitizing-user-input-before-adding-it-to-the-dom-in-javascript
 */
const sanitize = function(string) {
    const map = {
        '<': '&lt;',
        '>': '&gt;'
    };
    const sanitizedText = string.replace(/[<>]/ig, (match)=>(map[match]));
    return sanitizedText.replace(/\n/g, '<br>');
};
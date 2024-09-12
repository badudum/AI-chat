/*
 * CPEN 322 Assignment 6
 * Team Pookie Bears
 * David Lee, Felix Ma
 * April 8, 2024
 */


const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager (){
    // default session length - you might want to
    // set this to something small during development
    const CookieMaxAgeMs = 600000;

    // keeping the session data inside a closure to keep them protected
    const sessions = {};

    // might be worth thinking about why we create these functions
    // as anonymous functions (per each instance) and not as prototype methods
    this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
        const token = crypto.randomBytes(16).toString('hex');

        sessions[token] = {
            username: username,
            createTime: Date.now(),
            expireTime: Date.now() + maxAge
        }

        response.cookie('cpen322-session', token, {maxAge: maxAge});

        setTimeout(() => {
            delete sessions[token];
        }, maxAge);
        
        return token;
    };

    this.deleteSession = (request) => {
        if (!sessions[request.session]) {
            console.log("ERROR: SESSION NOT FOUND");
        }

        delete request.username;
        delete sessions[request.session];
        delete request.session;
    };

    this.middleware = (request, response, next) => {
        const cookieHeader = request.headers['cookie'];

        if (!cookieHeader) {
            return next(new SessionError("No cookie header found"));
        }

        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {});

        // Check if the 'cpen322-session' cookie is present
        const token = cookies['cpen322-session'];
        if (!token) {
            // If not, short circuit
            return next(new SessionError("Session token not found"));
        }

        // Check if the token is found in the sessions dictionary
        if (!(token in sessions)) {
            // If not, short circuit
            return next(new SessionError("Session token is invalid or expired"));
        }

        // Assign the username associated with the session to the request object
        // Update the session of the request to be the token
        request.username = sessions[token].username;
        request.session = token;
        next();
    };

    // this function is used by the test script.
    // you can use it if you want.
    this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
    // this.getUsername = function(token) {

    //     console.log("TRYING TO GET USERNAME OF THIS TOKEN", token);
    //     console.log("HERE IS SESSIONS", sessions);
    //     if (token in sessions) {
    //         console.log("WE ARE RETURNING THIS FROM GETUSERNAME", sessions[token].username);
    //         return sessions[token].username;
    //     } else {
    //         console.log("THAT TOKEN IS NOT IN THE DICT");
    //         return null;
    //     }
    // };
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;
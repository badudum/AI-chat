# **Team Pookie Bears Choose Your Own Adventure Application**

# **How to set up and run the code:**
1. Run the following command in the command line: 
```sh
user> npm install openai
```
2. In server.js, replace the placeholder API key with the one included in our submission
```js
user> const openai = new OpenAI({ apiKey: 'PUT_API_KEY_HERE' });
```
3. Load the proper databases with the following commands in the mongo shell:
```sh
test> use cpen322-messenger
cpen322-messenger> load("initdb.mongo")
cpen322-messenger> load("initUsers.mongo")
```
4. Exit from the mongo shell and run the server:
```sh
node server.js
```
5. For more instructions on how to 

# **Original AI Proposal Summary:**
Our proposal involved turning the chatrooms into adventure rooms, where players could come together to play out choose-your-own adventure stories powered by AI. We proposed allowing multiple players to influence the story, and also proposed multiple different settings for where the stories could take place, chosen by the users.

Our proposal was motivated by the fact that this would be a fun addition to the existing app, and it would allow us opportunity to change the frontend and backend while integrating with AI.

# **Detailed Implementation Explanation:**
#### Why OpenAI's API?
We considered a few different possible AI models to use, including Cohere AI as well as Google Gemeni. We ended up sticking to OpenAI and ChatGPT for the fact that it seemed the easiest to work with and implement. Furthermore, the ability to create a custom assistant to handle requests was crucial to our project; in developing this project we also made an OpenAI assistant powered by ChatGPT 3.5 Turbo whose role was to deliver the story elements based on the users' selections.
#### Integrating ChatGPT into our Program:
Upon receiving a message from the user, the server scans for whether the user said "begin adventure". If so, that room's entry in the database is updated to now have ```'isAdventure = true'```.

Once this property is changed, the story begins, with the user given the option to pick from four different settings, and ChatGPT carries on the rest of the story. This initial check is done through the server-side broker code, with the socket continuously listening for "begin adventure".

Once the story begins, the user may continue to type to their friends in the chat without interrupting the story. A room in adventure mode will have four buttons appear below the text input field, and the user may click on any one of them, corresponding to choosing that option in the story.

The buttons work by making a POST request to our backend ```/chat/gpt``` endpoint. This ensures that AI features are accessible via their REST API, allowing them to be smoothly integrated into our app.

# **User Manual:**
1. Log in as either Alice (password = ```secret```), or Bob (password = ```password```)
2. Enter any of the pre-made rooms, or make your own by typing a name into the text box and clicking ```Add Room```
3. If your friends are also in the room, you may chat to them
4. Once you are ready to begin a choose-your-own adventure story, simply type and send ```begin adventure```
5. ChatGPT will now present you with four options for different settings the story can take place in
6. Select whichever option you'd like to choose using the buttons that appear below the text entry box
7. Continue the story, continuing to select your preferred option using the buttons - note that the responses from GPT can take a few seconds to load after you press a button
8. Once you are satisfied, type and send ```end adventure``` to end the story
9. Multiple stories can be run at the same time in different rooms

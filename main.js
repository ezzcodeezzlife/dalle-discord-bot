const { Client, Intents } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Optional fine-tuning/embedding setup (currently disabled)
const execSync = require('child_process').execSync;
const { Configuration, OpenAIApi } = require("openai");

// Authenticate OpenAI & Setup Discord
const configuration = new Configuration({
  apiKey: process.env.openaiKey,
});

const openai = new OpenAIApi(configuration);
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES,  Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS], partials: ['CHANNEL', 'MESSAGE', 'REACTION'] });

// Initialize bot
const COMMAND_PREFIX = '!a';
client.once('ready', async c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
  client.user.setPresence({ activities: [{ name: 'openai.com' }], status: 'online' });
  return;
});

// Utility functions
const getPrompt = topic => fs.readFileSync(`prompts/${topic}.txt`, {encoding:'utf8', flag:'r'});
const getQuestion = msg => msg.content.replace(`${COMMAND_PREFIX} `, '');

// Load Prompts
const prompt_map = {
  'credit': getPrompt('credits'),
  'allowed': getPrompt('content_policy'),
  'general': getPrompt('generic'),
}
const SORT_QUESTIONS_PROMPT = getPrompt('sort_questions');

// OAI Helper Functions
const extractResponse = httpResp => httpResp.data.choices[0].text.trim();
const GPT3 = async prompt => await openai.createCompletion({
  model: 'text-davinci-002',
  prompt: prompt,
  stop: ['\n'],
  max_tokens: 164,
  temperature: 0,
}); 

/* === Bot Logic === */

async function determineQuestionCategory(question){
  /* Before doing anything, we sort the question into one of four categories:
    @credit - The question is about the credit system
    @allowed - The question is about the content policy, and whether something is allowed 
    @general - The question is a general question about DALLE-2 or OpenAI
    @offtopic - The question is a loaded/bait/unreleated question, or not a question at all
  */
  const choice = extractResponse(await GPT3(SORT_QUESTIONS_PROMPT + question + ' ->'));
  if (choice === 'This question is about the credit system'){
    return 'credit';
  } else if (choice === 'This question is about whether an image is allowed'){
    return 'allowed';
  } else if (choice === 'This question is a general inquiry') {
    return 'general';
  } else {
    return 'off-topic';
  }
}

client.on('messageCreate', async msg => {
  /* Handle new messages in multiple passes:
      @Step 1 - Sort the question into one of four buckets
      @Step 2 - If the bucket is not off-topic, either respond or direct to support@openai.com if you don't know 
  */
  if (msg.author.id !== client.user.id && msg.content.startsWith(COMMAND_PREFIX)){
    await msg.channel.sendTyping();

    let question = getQuestion(msg);
    let category = await determineQuestionCategory(question);

    if (category === 'off-topic'){ // No off-topic questions!
      msg.channel.send(`<@${msg.author.id}> I am only taking questions about DALLE-2. Your question appears to be off-topic.`)
    } else { 
      let prompt = prompt_map[category] + question + '\nA:';
      
      // TODO(radilx): Additional prompt iteration in playground using "Show Probabilities"
      let response = extractResponse(await GPT3(prompt));
      msg.channel.send(`<@${msg.author.id}> ${response}`);
    }
  }
}); 

client.login(process.env.token);
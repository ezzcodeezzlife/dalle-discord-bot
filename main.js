const { Client, Intents, MessageEmbed, } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Optional fine-tuning/embedding setup (currently disabled)
const { Configuration, OpenAIApi } = require("openai");

// Authenticate OpenAI & Setup Discord
const GPT_MODEL = 'text-davinci-002';
const configuration = new Configuration({
  apiKey: process.env.OAI_TOKEN,
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
const generateEmbed = (title, description, probability) => new MessageEmbed().setTitle(title.substring(0,256))
.setColor('#d24ede')
.setDescription(description)
.setFooter({text: `Answer generated using GPT-3 | Model: ${GPT_MODEL} | Confidence: ${Math.round(probability*100)??'N/A'}%`});
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Load Prompts
const prompt_map = {
  'credit': getPrompt('credits'),
  'allowed': getPrompt('content_policy'),
  'general': getPrompt('generic'),
}
const SORT_QUESTIONS_PROMPT = getPrompt('sort_questions');

// OAI Helper Functions
const extractResponse = httpResp => httpResp.data.choices[0].text.trim();
const extraProbability = httpResp => Math.E ** Object.values(httpResp.data.choices[0].logprobs.top_logprobs[0]).sort()[0];
const GPT3 = async prompt => await openai.createCompletion({
  model: GPT_MODEL,
  prompt: prompt,
  stop: ['\n'],
  max_tokens: 164,
  temperature: 0,
  logprobs: 3
}); 

/* === Bot Logic === */

async function determineQuestionCategory(question){
  /* Before doing anything, we sort the question into one of four categories:
    @credit - The question is about the credit system
    @allowed - The question is about the content policy, and whether something is allowed 
    @general - The question is a general question about DALL-E 2 or OpenAI
    @offtopic - The question is a loaded/bait/unreleated question, or not a question at all
  */
  const choice = extractResponse(await GPT3(SORT_QUESTIONS_PROMPT + question + ' ->')); 
  
  // TODO: Use fine-tuning for this & create smaller categories to reduce pricing load
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
      const embed = generateEmbed(`This Bot is for Questions Related to DALL-E`, `At this time, I am only taking questions about DALL-E 2. Your question appears to be off-topic.`);
      msg.channel.send({embeds: [embed]});
    } else { 
      let prompt = prompt_map[category] + question + '\nA:';
      
      // TODO: Additional prompt iteration in playground using "Show Probabilities"
      const GPTResponse = await GPT3(prompt);
      let response = extractResponse(GPTResponse);
      let probability = extraProbability(GPTResponse); 

      // Format question for embed
      let displayQuestion = capitalizeFirstLetter(question);
      if (!displayQuestion.endsWith('?')) displayQuestion+='?';

      // TODO: Double check answers to make sure they don't go against the content policy
      let embed = generateEmbed(`**Q:** ${displayQuestion}`, `**A:** ${response}`, probability);
      msg.channel.send({embeds: [embed]});

    }
  }
}); 

client.login(process.env.BOT_TOKEN);
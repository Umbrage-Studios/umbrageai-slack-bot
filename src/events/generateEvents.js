const EVENTS = [
  "appMention",
  "ask",
  "fate",
  "generateEvents",
  "message",
  "schedule",
  "summarize",
];

const generateEvents = () => {
  EVENTS.map((event) => {
    require(`./${event}`);
  });
};

module.exports = generateEvents;

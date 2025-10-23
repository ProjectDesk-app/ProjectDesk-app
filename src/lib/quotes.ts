export const quotes = [
  {
    text: "Education is not the filling of a pail, but the lighting of a fire.",
    author: "William Butler Yeats",
  },
  {
    text: "Research is creating new knowledge.",
    author: "Neil Armstrong",
  },
  {
    text: "Leadership is unlocking people's potential to become better.",
    author: "Bill Bradley",
  },
  {
    text: "The best teamwork comes from people who are working independently toward one goal in unison.",
    author: "James Cash Penney",
  },
  {
    text: "The beautiful thing about learning is that no one can take it away from you.",
    author: "B.B. King",
  },
  {
    text: "Alone we can do so little; together we can do so much.",
    author: "Helen Keller",
  },
  {
    text: "Project management is like juggling three balls – time, cost and quality.",
    author: "G. Reiss",
  },
  {
    text: "Teachers affect eternity; no one can tell where their influence stops.",
    author: "Henry Brooks Adams",
  },
  {
    text: "Coming together is a beginning; keeping together is progress; working together is success.",
    author: "Henry Ford",
  },
  {
    text: "It is not the answer that enlightens, but the question.",
    author: "Eugene Ionesco",
  },
  {
    text: "Any sufficiently advanced technology is indistinguishable from magic.",
    author: "Arthur C. Clarke",
  }
];

export function quoteOfTheDay() {
  const today = new Date();
  const index = today.getDate() % quotes.length;
  return quotes[index];
}

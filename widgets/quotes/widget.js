
// Inspirational Quotes Widget
// Features: Random quotes that change periodically with smooth transitions

const quotes = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
    { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
    { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
    { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" }
];

let currentIndex = Math.floor(Math.random() * quotes.length);
let intervalId = null;

const Box = new St.BoxLayout({
    vertical: true,
    style: `
        padding: 20px;
        background: linear-gradient(145deg, rgba(60, 20, 80, 0.9), rgba(100, 40, 120, 0.85));
        border-radius: 16px;
        border: 1px solid rgba(200, 150, 255, 0.2);
    `
});

// Quote icon
const icon = new St.Label({
    text: "✨",
    style: 'font-size: 1.5em; margin-bottom: 8px;',
    x_align: Clutter.ActorAlign.CENTER
});
Box.add_child(icon);

// Quote text
const quoteLabel = new St.Label({
    text: `"${quotes[currentIndex].text}"`,
    style: `
        font-size: 1.1em;
        font-weight: 400;
        font-style: italic;
        color: rgba(255, 255, 255, 0.95);
        text-align: center;
        line-height: 1.4;
    `,
    x_align: Clutter.ActorAlign.CENTER
});
quoteLabel.clutter_text.set_line_wrap(true);
Box.add_child(quoteLabel);

// Author
const authorLabel = new St.Label({
    text: `— ${quotes[currentIndex].author}`,
    style: `
        font-size: 0.9em;
        font-weight: 600;
        color: rgba(200, 150, 255, 0.9);
        margin-top: 12px;
    `,
    x_align: Clutter.ActorAlign.END
});
Box.add_child(authorLabel);

// Next quote button
const nextBtn = new St.Button({
    style_class: 'button',
    child: new St.Label({ text: "Next Quote →", style: 'font-size: 0.8em; color: rgba(255,255,255,0.7);' }),
    style: `
        margin-top: 16px;
        padding: 6px 12px;
        background-color: rgba(255,255,255,0.1);
        border-radius: 20px;
    `,
    x_align: Clutter.ActorAlign.CENTER
});

nextBtn.connect('clicked', () => {
    showNextQuote();
});
Box.add_child(nextBtn);

function showNextQuote() {
    currentIndex = (currentIndex + 1) % quotes.length;

    // Fade out
    quoteLabel.ease({
        opacity: 0,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT,
        onComplete: () => {
            // Update text
            quoteLabel.text = `"${quotes[currentIndex].text}"`;
            authorLabel.text = `— ${quotes[currentIndex].author}`;

            // Fade in
            quoteLabel.ease({
                opacity: 255,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_IN
            });
        }
    });

    authorLabel.ease({
        opacity: 0,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT,
        onComplete: () => {
            authorLabel.ease({
                opacity: 255,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_IN,
                delay: 100
            });
        }
    });
}

// Auto-rotate every 30 seconds
intervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => {
    showNextQuote();
    return GLib.SOURCE_CONTINUE;
});

// Cleanup
Box.connect('destroy', () => {
    if (intervalId) GLib.source_remove(intervalId);
});

return Box;

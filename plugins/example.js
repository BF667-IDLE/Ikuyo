export default {
    name: "Example Plugin",
    command: ["test", "halo"], // Bisa array atau string
    
    run: async (m, sock, { text, prefix, command, args }) => {
        // Logic Plugin di sini
        if (command === 'test') {
            await m.reply(`*Ini adalah plugin ESM!*\nNama Bot: ${global.config.name}`);
        }
        if (command === 'halo') {
            await m.reply('Halo juga dari plugin ESM! 👋');
        }
    }
};

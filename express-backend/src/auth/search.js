const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

async function searchUser(req, res) {
    try{
        const {q} = req.query;
        const users = await prisma.users.findMany({
            where:{
                OR:[
                    {username:{contains:q, mode:'insensitive'}},
                    {name:{contains:q, mode:'insensitive'}}
                ]
            },
            take:10,
        })
        return res.json({ users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = { searchUser };
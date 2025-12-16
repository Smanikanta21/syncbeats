require('dotenv').config()
const express = require('express')
const cookieParser = require('cookie-parser')
const session = require('express-session')
const cors = require('cors')
const passport = require('passport')
const path = require('path')
const app = express()
const authroutes = require('./routes/routes');
const router = require('./routes/routes')



app.use(cors({
  origin: [`${process.env.FRONTEND_DEV_URL}`],
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json({ limit: '100mb' }))
app.use(cookieParser())

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
  })
);

app.use(passport.initialize())
app.use(passport.session())

app.use('/auth', authroutes);
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/api', router)
app.get('/', (req, res) => {
  res.json({ message: "server is running" })
})


app.use((req, res) => {
  console.warn(`404 - Route not found: ${req.path}`)
  res.status(404).json({ message: 'Not Found' })
})






const port = process.env.PORT

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  })
}

module.exports = app;
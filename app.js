const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializedbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running on http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB error : ${e.message}`)
    process.exit(1)
  }
}
initializedbServer()

//middlewares

const autheticatetoken = (request, response, next) => {
  let jwttoken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwttoken = authHeader.split(' ')[1]
  }
  if (jwttoken) {
    jwt.verify(jwttoken, 'Bhanuprakash', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalids JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const getFOllowingPeopleId = async username => {
  const followingpeoplequery = `
  select following_user_id from follower
  inner join user on user.user_id = follower.follower_user_id where username = '${username}';`
  const following_people = await db.all(followingpeoplequery)
  const arrayofIds = following_people.map(
    eachuser => eachuser.following_user_id,
  )
  return arrayofIds
}

const tweetAceessVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `select * from
  tweet inner join on follower on tweet.user_id = follower.following_user_id
  where tweet.tweet_id = '${tweetId}' and follower_user_id = ${userId}
  ;`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(400)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API If the username already exists sends "User already exist" if If the registrant provides a password with less than 6 characters ,else Successful registration of the registrant

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getuser = `select * from user where username = '${username}'`
  const dbuser = await db.get(getuser)
  if (dbuser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    passwordlength = password.length
    if (passwordlength < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedpassword = await bcrypt.hash(password, 10)
      const insertuser = `insert into user (name,username,password,gender) 
      values(
      '${name}',
      '${username}',
      '${hashedpassword}',
      '${gender}' );`
      await db.run(insertuser)
      response.send('User created successfully')
    }
  }
})

//API If the user doesn't have a Twitter account sends statuscode 400 ,If the user provides an incorrect password sends statuscode 400 or user details correct Successful login of the user

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectuser = `select * from user where username = '${username}';`
  const getuser = await db.get(selectuser)
  if (getuser !== undefined) {
    const ispasswordmatched = await bcrypt.compare(password, getuser.password)
    if (ispasswordmatched) {
      const payload = {username, userId: getuser.user_id}
      const jwtToken = jwt.sign(payload, 'Bhanuprakash')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//API Returns the latest tweets of people whom the user follows. Return 4 tweets at a time

app.get('/user/tweets/feed/', autheticatetoken, async (request, response) => {
  const {username} = request
  const followingPeopleIds = await getFOllowingPeopleId(username)
  const getTweetsFeedQuery = `
    SELECT username, tweet, date_time AS dateTime FROM user INNER JOIN tweet ON user.user_id=tweet.user_id WHERE user.user_id IN (${followingPeopleIds}) 
    ORDER BY dateTime DESC LIMIT 4 
    ;`
  const tweetsFeedArray = await db.all(getTweetsFeedQuery)
  response.send(tweetsFeedArray)
})

//API Returns the list of all names of people whom the user follows

app.get('/user/following/', autheticatetoken, async (request, response) => {
  const {username, userId} = request
  const userFollowingQuery = `
    SELECT name FROM user INNER JOIN follower on user.user_id=follower.following_user_id WHERE follower_user_id = '${userId}';`
  const userFollowingArray = await db.all(userFollowingQuery)
  response.send(userFollowingArray)
})

//API Returns the list of all names of people who follows the user
app.get('/user/followers/', autheticatetoken, async (request, response) => {
  const {userId} = request
  const userFollowersQuery = `
    SELECT DISTINCT name FROM user INNER JOIN follower on user.user_id=follower.follower_user_id WHERE following_user_id = ${userId};`
  const userFollowersArray = await db.all(userFollowersQuery)
  response.send(userFollowersArray)
})

//API If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time
app.get(
  '/tweets/:tweetId/',
  autheticatetoken,
  tweetAceessVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const tweetsQuery = `
    SELECT tweet,(SELECT COUNT() FROM like WHERE tweet_id='${tweetId}') as likes,
    (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') as replies,
    date_time as dateTime 
    FROM tweet 
    WHERE tweet.tweet_id = '${tweetId}';`
    const tweetResult = await db.get(tweetsQuery)
    response.send(tweetResult)
  },
)

//If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet

app.get(
  '/tweets/:tweetId/likes/',
autheticatetoken,tweetAceessVerification
  async (request, response) => {
    const {tweetId} = request.params

    const getLikerUsersQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id 
    WHERE tweet_id = '${tweetId}';`
    const likedUsers = await db.all(getLikerUsersQuery)
    const userArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: userArray})
  },
)

//API  If the user requests a tweet of a user he is following, return the list of replies.

app.get(
  '/tweets/:tweetId/replies/',
  autheticatetoken,
 tweetAceessVerification,
  async (request, response) => {
    const {tweetId} = request.params

    const getRepliedUserQuery = `
    SELECT name,reply 
    FROM user INNER JOIN reply ON user.user_id=reply.user_id 
    WHERE tweet_id = '${tweetId}';`
    const repliedUsers = await db.all(getRepliedUserQuery)
    response.send({replies: repliedUsers})
  },
)

//API Returns a list of all tweets of the user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetsDetailsQuery = `
    SELECT tweet, 
    COUNT(DISTINCT like_id) AS likes, 
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime 
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN
    like ON tweet.tweet_id = like.tweet_id 
    WHERE tweet.user_id = '${userId}' 
    GROUP BY tweet.tweet_id

    ;`;
  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);
});


//Create a tweet in the tweet table

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { userId } = parseInt(request.user_id);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const postTweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time) VALUES ('${tweet}','${userId}','${dateTime}');`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});


module.exports = app

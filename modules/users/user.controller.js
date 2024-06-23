const userModel = require("./user.model");
const { hashPassword, comparePassword } = require("../../utils/bcrypt");
const { mail } = require("../../services/mailer");
const { generateToken, generateRandomToken } = require("../../utils/token");
// create
const create = async (payload) => {
  payload.password = hashPassword(payload.password);
  const user = await userModel.create(payload);
  delete user.password;
  return user;
};

// Read Part 1
const list = async (search, page = 1, limit = 1) => {
  const query = [];

  if (search?.name) {
    query.push({
      $match: {
        name: new RegExp(search?.name, "gi"),
      },
    });
  }
  query.push(
    {
      $facet: {
        metadata: [
          {
            $count: "total",
          },
        ],
        data: [
          {
            $skip: (+page - 1) * +limit,
          },
          {
            $limit: +limit,
          },
        ],
      },
    },
    {
      $addFields: {
        total: {
          $arrayElemAt: ["$metadata.total", 0],
        },
      },
    },
    {
      $project: {
        metadata: 0,
        "data.password": 0,
      },
    }
  );
  const result = await userModel.aggregate(query);
  return {
    total: result[0].total || 0,
    data: result[0].data,
    page: +page,
    limit: +limit,
  };
};

// Read Part 2
const getById = (_id) => {
  return userModel.findOne({ _id });
};

// Update
const updateById = (_id, payload) => {
  return userModel.updateOne({ _id }, payload);
};

// Delete
const removeById = (_id) => {
  return userModel.deleteOne({ _id });
};

const register = async (payload) => {
  delete payload.roles;
  payload.password = hashPassword(payload.password);
  const user = await userModel.create(payload);
  if (!user) throw new Error("Registration failed");
  // email send
  await mail(
    user.email,
    "Registration Completed",
    "You are successfully registered. Thank you for registering."
  );
  return { success: true, message: "Registration Completed" };
};

const login = async (payload) => {
  const { email, password } = payload;
  if (!email || !password) throw new Error("Email or password is missing");
  const user = await userModel.findOne({ email, isActive: true });
  if (!user) throw new Error("User doesn't exists");
  const isValidPw = comparePassword(password, user.password);
  if (!isValidPw) throw new Error("Email or password mismatch");
  const tokenData = { name: user.name, email: user.email, role: user.roles };
  return generateToken(tokenData);
};

const generateFPToken = async (payload) => {
  // email xa ki xaina?
  const { email } = payload;
  if (!email) throw new Error("Email doesn't exist");
  // user exists??
  const user = await userModel.findOne({ email, isActive: true });
  if (!user) throw new Error("User doesn't exist");
  // fp token utils??
  const token = generateRandomToken();
  // store that token in user model token
  const updateUser = await userModel.updateOne({ email }, { token });
  if (!updateUser) throw new Error("Something went wrong. Try again later");
  // send that token in users email
  await mail(email, "Forget Password Token", `Your token is ${token}`);
  return "Forget password token generated successfully";
};

const verifyFPToken = async (payload) => {
  const { email, token, newPassword } = payload;
  if (!email || !token || !newPassword) throw new Error("Something is missing");
  // User exist
  const user = await userModel.findOne({ email, isActive: true });
  if (!user) throw new Error("User doesn't exist");
  // compare two tokens
  const isValidToken = token === user.token;
  if (!isValidToken) throw new Error("Token mismatch");
  // user update with new password
  const updatedUser = await userModel.updateOne(
    { email },
    { password: hashPassword(newPassword), token: "" }
  );
  if (!updatedUser) throw new Error("Process failed. Try again later");
  // return success message
  return "Password reset successfully";
};

const changePassword = async (payload) => {
  const { email, oldPassword, newPassword } = payload;
  if (!email || !oldPassword || !newPassword)
    throw new Error("Something is missing");
  const user = await userModel.findOne({ email, isActive: true });
  if (!user) throw new Error("User not found");
  const isValidOldPw = comparePassword(oldPassword, user.password);
  if (!isValidOldPw) throw new Error("Password didn't match");
  const updateUser = await userModel.updateOne(
    { email },
    { password: hashPassword(newPassword) }
  );
  if (!updateUser) throw new Error("Try again later");
  return "Password changed successfully";
};

const resetPassword = async (payload) => {
  const { email, newPassword } = payload;
  if (!email || !newPassword) throw new Error("Something is missing");
  const user = await userModel.findOne({ email, isActive: true });
  if (!user) throw new Error("User not found");
  const updateUser = await userModel.updateOne(
    { email },
    { password: hashPassword(newPassword) }
  );
  if (!updateUser) throw new Error("Try again later");
  return "Password reset successfully";
};

const blockUser = async (payload) => {
  const { email } = payload;
  const user = await userModel.findOne({ email });
  if (!user) throw new Error("User not found");
  const status = { isActive: !user?.isActive };
  const updateUser = await userModel
    .findOneAndUpdate({ email }, status, {
      new: true,
    })
    .select("-password");
  if (!updateUser) throw new Error("Try again later.");
  return {
    msg: `User ${status?.isActive ? "unblocked" : "blocked"} Successfully`,
    data: updateUser,
  };
};

const getProfile = (_id) => {
  return userModel.findOne({ _id, isActive: true }).select("-password");
};

const updateProfile = (_id, payload) => {
  const { roles, email, password, isActive, ...rest } = payload;
  return userModel.updateOne({ _id }, rest);
};

module.exports = {
  create,
  list,
  getById,
  updateById,
  removeById,
  register,
  login,
  generateFPToken,
  verifyFPToken,
  changePassword,
  resetPassword,
  blockUser,
  getProfile,
  updateProfile,
};

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../../model/userModel");
const { uploadToCloudinary } = require('../middleware/uploadMiddleware');
const JWT_SECRET = process.env.JWT_SECRET;

// Signup
exports.signup = async (req, res) => {
  let { name, email, password } = req.body;
  try {
    email = email.trim().toLowerCase().replace(/\s+/g, '');
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    res.status(201).json({
      message: "User created",
      user: { id: user._id, name: user.name }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only secure in production
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: "/",
      maxAge: 3600000, // 1 hour
    };

    // Only add domain if it's set and not empty
    if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN.trim() !== '') {
      cookieOptions.domain = process.env.COOKIE_DOMAIN;
    }

    res.cookie("token", token, cookieOptions);

    res.json({
      message: "Logged in successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Google Login
exports.googleLogin = async (req, res) => {
  const { email, name, googleId, profilePicture } = req.body;

  try {
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        name,
        googleId,
        profilePicture,
        isVerified: true,
      });
    } else {
      if (!user.googleId) {
        user.googleId = googleId;
        user.profilePicture = profilePicture || user.profilePicture;
        user.isVerified = true;
        await user.save();
      }
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only secure in production
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: "/",
      maxAge: 3600000, // 1 hour
    };

    // Only add domain if it's set and not empty
    if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN.trim() !== '') {
      cookieOptions.domain = process.env.COOKIE_DOMAIN;
    }

    res.cookie("token", token, cookieOptions);

    res.json({
      message: "Logged in with Google successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(500).json({ message: "Server error during Google authentication" });
  }
};

// Get All Users' Emails
exports.getAllEmails = async (req, res) => {
  try {
    const users = await User.find({}, "name email role lastLogin isVerified");
    const userList = users.map(user => ({
      name: user.name,
      email: user.email,
      role: user.role,
      lastLogin: user.lastLogin,
      isVerified: user.isVerified
    }));
    res.status(200).json({ users: userList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
};

// Profile
exports.profile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userProfile = await User.findById(userId).select('-password');
    if (!userProfile) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile retrieved successfully",
      user: {
        id: userProfile._id,
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role,
        profilePicture: userProfile.profilePicture,
        googleId: userProfile.googleId,
        isVerified: userProfile.isVerified
      }
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({
      message: "Error fetching profile",
      error: error.message
    });
  }
};

// Logout
exports.logout = (req, res) => {
  // Create cookie options
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Only secure in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: "/",
  };

  // Only add domain if it's set and not empty
  if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN.trim() !== '') {
    cookieOptions.domain = process.env.COOKIE_DOMAIN;
  }

  // Clear the cookie with the exact same settings as when it was set
  res.clearCookie("token", cookieOptions);

  // Explicitly set the cookie to expire in the past as a fallback
  res.cookie("token", "", {
    ...cookieOptions,
    expires: new Date(0),
  });

  res.status(200).json({ message: "Logged out successfully" });
};

// Delete User
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found!" });
    }

    res.status(200).json({
      message: "User deleted successfully!",
      user: {
        id: deletedUser._id,
        name: deletedUser.name,
        email: deletedUser.email
      }
    });
  } catch (error) {
    res.status(400).json({
      message: "Error",
      error: error.message
    });
  }
};

// Get Current User
exports.getCurrentUser = async (req, res) => {
  try {
    // The user is already attached to the request by the isAuthenticated middleware
    const user = req.user;
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get the full user data from the database
    const userData = await User.findById(user.id).select('-password');
    
    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user data in the format expected by the frontend
    const formattedUser = {
      _id: userData._id,
      name: userData.name,
      firstName: userData.name.split(' ')[0], // Assuming first name is the first part of the name
      lastName: userData.name.split(' ').slice(1).join(' '), // Rest of the name as last name
      email: userData.email,
      photo: userData.profilePicture, // Map profilePicture to photo
      profilePicture: userData.profilePicture,
      role: userData.role,
      isVerified: userData.isVerified,
      phone: userData.phone,
      location: userData.location,
      bio: userData.bio
    };

    res.status(200).json({ user: formattedUser });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update User Role
exports.updateRole = async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['buyer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    const userId = req.user._id;
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Role updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating role",
      error: error.message
    });
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  console.log('UPDATE PROFILE ENDPOINT HIT!');
  console.log('Request body:', req.body);
  console.log('User:', req.user);
  
  try {
    const { name, email, profilePicture, bio, phone, location } = req.body;
    const userId = req.user._id;

    // Check if email is being changed and if it already exists
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email.trim().toLowerCase();
    if (profilePicture) updateData.profilePicture = profilePicture;
    if (bio !== undefined) updateData.bio = bio;
    if (phone) updateData.phone = phone;
    if (location) updateData.location = location;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log('Updated user:', user);

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        bio: user.bio,
        phone: user.phone,
        location: user.location,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({
      message: "Error updating profile",
      error: error.message
    });
  }
};

// Profile Image Upload
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadToCloudinary(req.file, 'profile-pictures');
    const userId = req.user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { profilePicture: result.secure_url },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile picture updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error("Profile image upload error:", error);
    res.status(500).json({
      message: "Error uploading profile picture",
      error: error.message
    });
  }
};

// Update Profile Image
exports.updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Upload to Cloudinary using the helper function
    const result = await uploadToCloudinary(req.file);

    // Update user's profile picture URL in database
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture: result.secure_url },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile picture updated successfully',
      profilePicture: result.secure_url
    });
  } catch (error) {
    console.error('Error updating profile picture:', error);
    res.status(500).json({
      message: 'Error updating profile picture',
      error: error.message
    });
  }
};

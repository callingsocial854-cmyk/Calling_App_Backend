import mongoose from "mongoose";

const contactUsSchema = new mongoose.Schema({
  officeLocation: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: Number,
    required: true,
  },
});

const ContactUs = mongoose.model("ContactUs", contactUsSchema);

export { ContactUs };

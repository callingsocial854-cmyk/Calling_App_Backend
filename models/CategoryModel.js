import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: Boolean, default: true },
  categoryRole: { type: String, enum: ["Agent", "User"], default: "User" },
});


const categoryFieldSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  label: { type: String, required: true },
  key: { type: String, required: true },
  fieldType: {
    type: String,
    enum: ["dropdown", "multiselect", "text"],
    default: "dropdown",
  },
  options: [
    {
      label: String,
      value: String,
    },
  ],

  isRequired: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  categoryFieldRole: { type: String, enum: ["Agent", "User"], default: "User" },
});


const Category = mongoose.model("Category", categorySchema);
const CategoryField = mongoose.model("CategoryField", categoryFieldSchema);

export { Category, CategoryField };



import multer from "multer";
import path from "path";

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`);
  }
});

// 🔥 Accept ALL file types
const mediaFileFilter = (req, file, cb) => {
  cb(null, true);
};

export const uploadMediaFiles = multer({
  storage: mediaStorage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 200 * 1024 * 1024 },
}).array("mediaFiles", 200);

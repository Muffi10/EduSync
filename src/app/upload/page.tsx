"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import Image from "next/image";

export default function UploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [videoPreview, setVideoPreview] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "video" | "thumbnail") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "video") {
      setVideoFile(file);
      // Create preview URL
      setVideoPreview(URL.createObjectURL(file));
    } else {
      setThumbnailFile(file);
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!videoFile) {
      setError("Video file is required");
      return;
    }

    setUploading(true);
    setError("");
    setProgress(0);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("User not authenticated");

      // Upload video with progress tracking
      const videoRef = ref(storage, `videos/${Date.now()}-${videoFile.name}`);
      const uploadTask = uploadBytesResumable(videoRef, videoFile);

      // Track upload progress
      const videoUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            // Progress tracking
            const progressPercent = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            setProgress(progressPercent);
          },
          (error) => {
            // Handle unsuccessful uploads
            reject(error);
          },
          async () => {
            // Handle successful uploads on complete
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            } catch (error) {
              reject(error);
            }
          }
        );
      });

      // Upload thumbnail if provided
      let thumbnailUrl = "";
      if (thumbnailFile) {
        const thumbRef = ref(storage, `thumbnails/${Date.now()}-${thumbnailFile.name}`);
        const thumbUploadTask = uploadBytesResumable(thumbRef, thumbnailFile);
        
        thumbnailUrl = await new Promise<string>((resolve, reject) => {
          thumbUploadTask.on(
            'state_changed',
            () => {
              // Optional: could track thumbnail upload progress separately
            },
            (error) => {
              reject(error);
            },
            async () => {
              try {
                const downloadUrl = await getDownloadURL(thumbUploadTask.snapshot.ref);
                resolve(downloadUrl);
              } catch (error) {
                reject(error);
              }
            }
          );
        });
      }

      const res = await fetch("/api/video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          videoUrl,
          thumbnailUrl,
          visibility,
          tags: tags.split(",").map(tag => tag.trim()).filter(tag => tag),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Upload failed");
      }

      const { videoId } = await res.json();
      router.push(`/watch/${videoId}`);
    } catch (err: any) {
      setError(err.message || "Upload failed. Please try again.");
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Upload Video</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Video upload */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4">
            {videoPreview ? (
              <div className="relative aspect-video bg-black rounded overflow-hidden">
                <video 
                  src={videoPreview} 
                  controls 
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                  <Image 
                    src="/images/video-upload.png" 
                    alt="Upload" 
                    width={48} 
                    height={48}
                    className="dark:invert"
                  />
                </div>
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Drag and drop video files</p>
                <p className="text-sm text-gray-500 mb-4">or</p>
                <label className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer">
                  Select Files
                  <input 
                    type="file" 
                    accept="video/*" 
                    className="hidden" 
                    onChange={(e) => handleFileChange(e, "video")}
                  />
                </label>
                <p className="text-xs text-gray-500 mt-2">MP4 or WebM up to 1080p, 60fps</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Thumbnail (Optional)
            </label>
            <div className="flex items-center space-x-4">
              {thumbnailFile ? (
                <div className="relative w-32 h-20 rounded overflow-hidden">
                  <Image
                    src={URL.createObjectURL(thumbnailFile)}
                    alt="Thumbnail preview"
                    fill
                    className="object-cover"
                  />
                  <button 
                    onClick={() => setThumbnailFile(null)}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center w-32 h-20 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => handleFileChange(e, "thumbnail")}
                  />
                </label>
              )}
              <p className="text-sm text-gray-500">Recommended: 1280x720 (16:9)</p>
            </div>
          </div>
        </div>

        {/* Right column - Details form */}
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title *
            </label>
            <input
              id="title"
              type="text"
              placeholder="Add a title that describes your video"
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
            <div className="text-xs text-gray-500 text-right mt-1">{title.length}/100</div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              id="description"
              placeholder="Tell viewers about your video"
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
            />
            <div className="text-xs text-gray-500 text-right mt-1">{description.length}/5000</div>
          </div>

          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags
            </label>
            <input
              id="tags"
              type="text"
              placeholder="Add tags separated by commas"
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Tags help people discover your video</p>
          </div>

          <div>
            <label htmlFor="visibility" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Visibility
            </label>
            <select
              id="visibility"
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Upload button and progress */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
        {error && (
          <div className="text-red-500 text-sm flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
        <div className="flex-1"></div>
        <div className="flex items-center space-x-4">
          {uploading && (
            <div className="flex items-center space-x-2">
              <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-300">{progress}%</span>
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={uploading || !title.trim() || !videoFile}
            className={`px-6 py-2 rounded-full font-medium ${
              uploading || !title.trim() || !videoFile
                ? 'bg-blue-400 dark:bg-blue-800 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-800 cursor-pointer text-white'
            }`}
          >
            {uploading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </span>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
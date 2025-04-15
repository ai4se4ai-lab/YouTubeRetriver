/**
 * YouTube API Service
 */
const { google } = require("googleapis");
const authService = require("./authService");

module.exports = {
  /**
   * Get user's liked videos
   * @param {string} accessToken - The access token
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} Array of liked videos
   */
  async getLikedVideos(accessToken, maxResults = 50) {
    try {
      console.log(
        "Attempting to fetch liked videos with token:",
        accessToken.substring(0, 10) + "..."
      );
      const auth = authService.getAuthenticatedClient(accessToken);
      const youtube = google.youtube({ version: "v3", auth });

      const videos = [];
      let pageToken = null;
      let totalResults = 0;

      // Fetch all pages until we reach maxResults or there are no more pages
      do {
        const response = await youtube.videos.list({
          part: "snippet,contentDetails,statistics",
          myRating: "like",
          maxResults: Math.min(50, maxResults - totalResults), // YouTube API limits to 50 per request
          pageToken,
        });

        const items = response.data.items || [];

        // Format video data
        const formattedVideos = items.map((video) => ({
          id: video.id,
          title: video.snippet.title,
          channelTitle: video.snippet.channelTitle,
          channelId: video.snippet.channelId,
          publishedAt: video.snippet.publishedAt,
          description: video.snippet.description,
          thumbnailUrl:
            video.snippet.thumbnails?.high?.url ||
            video.snippet.thumbnails?.default?.url,
          duration: video.contentDetails.duration,
          viewCount: video.statistics.viewCount,
          likeCount: video.statistics.likeCount,
          commentCount: video.statistics.commentCount,
        }));

        videos.push(...formattedVideos);
        totalResults += items.length;
        pageToken = response.data.nextPageToken;
      } while (pageToken && totalResults < maxResults);

      return videos;
    } catch (error) {
      console.error("Detailed error fetching liked videos:", error);
      throw new Error("Failed to fetch liked videos");
    }
  },

  /**
   * Get user's watch history - UPDATED METHOD
   * Uses YouTube Activities API instead of trying to access watch history directly
   * 
   * @param {string} accessToken - The access token
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} Array of watch history items
   */
  async getWatchHistory(accessToken, maxResults = 50) {
    try {
      console.log("Fetching watch history using activities API");
      const auth = authService.getAuthenticatedClient(accessToken);
      const youtube = google.youtube({ version: "v3", auth });

      // Use activities API to get watch history
      // This is more reliable than trying to access the watch history playlist directly
      const historyItems = [];
      let pageToken = null;
      let totalResults = 0;

      try {
        // Attempt to use activities API first
        do {
          const activitiesResponse = await youtube.activities.list({
            part: "snippet,contentDetails",
            mine: true, 
            maxResults: Math.min(50, maxResults - totalResults),
            pageToken,
          });

          const items = activitiesResponse.data.items || [];
          
          // Filter for watch activities only
          const watchItems = items.filter(item => 
            item.snippet.type === "watch" || 
            item.snippet.type === "playlistItem" ||
            (item.contentDetails && item.contentDetails.upload)
          );

          // Format history data
          const formattedItems = watchItems.map((item) => {
            // Extract video ID based on activity type
            let videoId = null;
            if (item.contentDetails && item.contentDetails.upload) {
              videoId = item.contentDetails.upload.videoId;
            } else if (item.contentDetails && item.contentDetails.playlistItem) {
              videoId = item.contentDetails.playlistItem.resourceId.videoId;
            } else if (item.contentDetails && item.contentDetails.recommendation) {
              videoId = item.contentDetails.recommendation.resourceId.videoId;
            }

            return {
              id: item.id,
              videoId: videoId,
              title: item.snippet.title,
              channelTitle: item.snippet.channelTitle,
              channelId: item.snippet.channelId,
              watchedAt: item.snippet.publishedAt,
              thumbnailUrl:
                item.snippet.thumbnails?.high?.url ||
                item.snippet.thumbnails?.default?.url,
            };
          }).filter(item => item.videoId !== null); // Filter out items without videoId

          historyItems.push(...formattedItems);
          totalResults += formattedItems.length;
          pageToken = activitiesResponse.data.nextPageToken;
        } while (pageToken && totalResults < maxResults);

        return historyItems;
      } catch (activityError) {
        console.error("Error with activities API:", activityError);
        
        // If activities API fails, try a more basic approach - just return an empty array
        // to prevent application crashes
        console.log("Returning empty watch history due to API limitations");
        return [];
      }
    } catch (error) {
      console.error("Error fetching watch history:", error);
      // Return empty array instead of throwing to prevent application crashes
      return [];
    }
  },

  /**
   * Get channel statistics
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} Channel statistics
   */
  async getChannelStatistics(accessToken) {
    try {
      const auth = authService.getAuthenticatedClient(accessToken);
      const youtube = google.youtube({ version: "v3", auth });

      // Get channel info
      const channelResponse = await youtube.channels.list({
        part: "snippet,statistics,contentDetails",
        mine: true,
      });

      const channelData = channelResponse.data.items[0];

      // Get subscription count
      const subscriptionsResponse = await youtube.subscriptions.list({
        part: "snippet",
        mine: true,
        maxResults: 0, // We only need the total count
      });

      return {
        channelId: channelData.id,
        title: channelData.snippet.title,
        description: channelData.snippet.description,
        createdAt: channelData.snippet.publishedAt,
        thumbnailUrl: channelData.snippet.thumbnails?.high?.url,
        viewCount: channelData.statistics.viewCount,
        subscriberCount: channelData.statistics.subscriberCount,
        videoCount: channelData.statistics.videoCount,
        subscriptionCount: subscriptionsResponse.data.pageInfo.totalResults,
      };
    } catch (error) {
      console.error("Error fetching channel statistics:", error);
      throw new Error("Failed to fetch channel statistics");
    }
  },
};
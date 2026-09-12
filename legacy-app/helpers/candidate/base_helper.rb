# frozen_string_literal: true

IMAGE_EXTS = %w[gif jpg png jpeg]
VIDEO_EXTS = %w[webm mp4]

module Candidate::BaseHelper
  def url_image?(uri="")
    IMAGE_EXTS.any? { |ext| uri.end_with?(ext) }
  end

  def url_video?(uri="")
    VIDEO_EXTS.any? { |ext| uri.end_with?(ext) }
  end
end

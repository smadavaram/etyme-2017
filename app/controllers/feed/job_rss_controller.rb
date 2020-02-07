# frozen_string_literal: true

class Feed::JobRssontroller < ApplicationController
  # layout 'static'

  def feed
    @jobs = Job.active.is_public
    respond_to do |format|
      format.rss { render layout: false }
    end
  end
end

class Feed::JobRssontroller < ApplicationController
  # layout 'static'

 def feed
    @jobs = Job.all
    respond_to do |format|
      format.rss { render :layout => false }
    end
  end

end

class Feed::RssJobsController < ApplicationController
  layout 'company'

  def feeds
  end

 def job_feed
    @jobs = Job.where(:listing_type=>"Job").where(:status =>"Published")
    respond_to do |format|
      format.rss { render :layout => false }
    end
  end

  def product_feed
    @jobs = Job.where(:listing_type=>"Products").where(:status =>"Published")
    respond_to do |format|
      format.rss { render :layout => false }
    end
  end

  def service_feed
    @jobs = Job.where(:listing_type=>"Services").where(:status =>"Published")
    respond_to do |format|
      format.rss { render :layout => false }
    end
  end

  def trining_feed
    @jobs = Job.where(:listing_type=>"Training").where(:status =>"Published")
    respond_to do |format|
      format.rss { render :layout => false }
    end
  end

end

class StaticController < ApplicationController

  skip_before_action :authenticate_user!
  before_action      :set_jobs ,only: :index

  layout 'static'
  add_breadcrumb "Home",'/'

  def index
  end

  def signup
  end
  def signin
    if request.post?
      if params[:domain].present?
        company = Company.where(slug: params[:domain]).first
        if company.present?
          return redirect_to "http://#{company.etyme_url}/"
        else
          flash.now[:error] = 'No such domain in the system'
        end
      else
        flash.now[:error] = 'Please enter your email or domain'
      end
    end

  end

  private

  def set_jobs
    @search = Job.is_public.active.search(params[:q])
    @count = @search.result(distinct: true).count
    @jobs = @search.result.group_by(&:job_category)
    # puts @jobs.map(& :job_category)
  end
end

class StaticController < ApplicationController

  skip_before_action :authenticate_user!
  before_action      :set_jobs ,only: :index

  layout 'landing'

  def index
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
    render layout: 'application'

  end

  private

  def set_jobs
    @jobs = Job.is_public.active.group_by(&:job_category)
    # puts @jobs.map(& :job_category)
  end
end

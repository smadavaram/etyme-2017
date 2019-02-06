class StaticController < ApplicationController

  include DomainExtractor

  skip_before_action :authenticate_user!, raise: false
  before_action :set_jobs, only: :index
  before_action :set_company, :set_slug, only: :signin

  layout 'static'
  add_breadcrumb "Home",'/'

  def index
  end

  def signup
  end

  def signin
    if request.post?
      if params[:email].present?
        if @company.present?
          redirect_to "http://#{@company.etyme_url}/?email=#{params[:email]}"
        else
          flash.now[:error] = 'No such domain in the system'
        end
      else
        flash.now[:error] = 'Please enter your email or domain'
      end
    end

  end

  private

    def set_company
      domain = domain_from_email(params[:email])
      @company = Company.find_by(website: domain)

      unless @company
        redirect_to signin_path, error: 'Company Not Found'
      end
    end

    def set_slug
      if @company
        @slug = @company.slug
      end
    end

    def set_jobs
      @search = Job.is_public.active.search(params[:q])
      @count = @search.result(distinct: true).count
      @jobs = @search.result.group_by(&:job_category)
    end

end

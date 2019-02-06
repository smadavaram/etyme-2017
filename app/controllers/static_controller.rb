class StaticController < ApplicationController

  include DomainExtractor

  skip_before_action :authenticate_user!, raise: false
  before_action :set_jobs, only: :index
  before_action :set_slug, only: :signin

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

  def check_for_domain
    company = Company.where(website: params[:website]).first()

    if company
      total_count = 0
      company_slug = company.slug
    else
      company_slug = ""
      total_count = Company.where("slug like ?", "#{domain_name}%").count
    end

    render json: { present_count: total_count , company_slug: company_slug }
  end

  private

    def set_slug
      domain = domain_from_email(params[:email])
    end

    def domain_name
      params[:website].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase
    end

    def set_jobs
      @search = Job.is_public.active.search(params[:q])
      @count = @search.result(distinct: true).count
      @jobs = @search.result.group_by(&:job_category)
    end

end

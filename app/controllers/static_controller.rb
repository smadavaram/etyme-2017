class StaticController < ApplicationController

  include DomainExtractor

  skip_before_action :authenticate_user!, raise: false
  before_action :set_jobs, only: :index
  before_action :set_company, :set_slug, only: :signin
  before_action :find_user, :set_website, :find_similar_companies, only: :domain_suggestion

  layout 'static', except: [:apply]
  layout 'static_headers_less', only: [:apply]
  add_breadcrumb "Home", '/'


  def index
  end

  def contact_us
  end

  def privacy_policy
  end

  def terms_of_use
  end

  def signup
  end

  def acknowledge_refrence
    @client = Client.find_by(id: params[:id])
    if params[:slug] == @client.slug_one
      @client.update(refrence_one: true)
    elsif params[:slug] == @client.slug_two
      @client.update(refrence_two: true)
    end
    redirect_to root_path
  end

  def signin
    if request.post?
      if params[:email].present?
        if @company.present?
          if Rails.env.production?
            redirect_to "https://#{@company.etyme_url}/?email=#{params[:email]}"
          else
            redirect_to "http://#{@company.etyme_url}/?email=#{params[:email]}"
          end
        else
          flash.now[:error] = 'No such domain in the system'
        end
      else
        flash.now[:error] = 'Please enter your email or domain'
      end
    end

  end

  def domain_suggestion
    @company = Company.find_by(website: @website)
    handle_invalid_email
    respond_to do |format|
      if @company
        format.html {}
        format.json do
          domain = get_uniq_domain(get_domain_from_email(params[:email]))
          render json: {message: 'Looks like company already registered. Just add it as contact.', slug: @company.try(:slug), website: domain_name(params[:email]), name: @company.try(:name), company_type: @company.try(:company_type), domain: domain, status: :ok}
        end
      else
        format.html {}
        format.json do
          render json: {message: 'Company domain is available.', slug: suggested_slug, website: domain_from_email(params[:email]), domain: get_domain_from_email(params[:email]), status: :ok}
        end
      end
    end
  end

  private

  def get_uniq_domain(domain)
    if domain.present?
      total_domain = Company.where("domain like ?", "#{domain.gsub(/[^0-9A-Za-z.]/, '').downcase}%").count
      if total_domain == 0
        domain = "#{domain.gsub(/[^0-9A-Za-z.]/, '').downcase}"
      else
        l = 1
        domain = "#{domain.gsub(/[^0-9A-Za-z.]/, '').downcase}#{total_domain + l }"
        collision = Company.find_by_domain(domain)
        until collision.nil?
          l = l + 1
          domain = "#{domain.gsub(/[^0-9A-Za-z.]/, '').downcase}#{total_domain +l}"
          collision = Company.find_by_domain(domain)
        end
      end
    end
    domain
  end

  def handle_invalid_email
    unless ::EMAIL_REGEX =~ params[:email]
      respond_to do |format|
        format.json do
          render json: {message: 'Invalid email entered.', status: :unprocessible_entity}
        end
      end
    end
  end

  def find_user
    @website = valid_email(params[:email])
    @find_company = Company.find_by(website: @website)
    @user = User.find_by(email: params[:email])
    if @user
      respond_to do |format|
        format.html {}
        format.json do
          if @user.company.domain != current_user.company.domain
            render json: {status: :ok, slug: @find_company.try(:slug), website: domain_from_email(params[:email]), name: @find_company.try(:name), company_type: @find_company.try(:company_type), registred_in_company: false}
          else
            render json: {message: 'User already registered.', status: :unprocessible_entity, slug: @find_company.try(:slug), website: domain_from_email(params[:email]), name: @find_company.try(:name), company_type: @find_company.try(:company_type)}
          end

        end
      end
    end
  end

  def set_website
    @website = valid_email(params[:email])

    unless @website
      respond_to do |format|
        format.html {}
        format.json do
          render json: {message: 'Email is Invalid', status: :unprocessible_entity}
        end
      end
    end
  end

  def find_similar_companies
    @similar_companies = Company.find_like(:slug, domain_name(params[:email]))
  end

  def suggested_slug
    if @similar_companies.size > 1
      domain_name(params[:email]).concat((@similar_companies.size + 1).to_s)
    else
      domain_name(params[:email])
    end
  end

  def set_company
    if params[:email].present?
      domain = domain_from_email(params[:email])
      @company = Company.find_by(website: domain)

      unless @company
        # respond_to do |format|
        redirect_to signin_path, error: 'Company Not Found'
        # end
      end
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

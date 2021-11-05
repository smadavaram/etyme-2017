# frozen_string_literal: true

class CompaniesController < ApplicationController
  skip_before_action :authenticate_user!, only: %i[new create signup_success], raise: false
  before_action :find_company, only: :profile
  before_action :set_domain, only: %i[create]
  # before_action :redirect_to_main_domain, only: [:new]

  include DomainExtractor
  include Rewardful
  respond_to :html, :json

  layout 'company_account'

  add_breadcrumb 'Home', '/'

  def new
    add_breadcrumb 'Company', ''
    add_breadcrumb 'Sign Up', ''

    @company = Company.new
    @company.build_owner(type: 'Admin')
  end

  def create
    @company = Company.new(company_params.merge(website: domain_from_email(owner_params[:email])))
    @company.owner.confirmed_at = DateTime.now
    if @company.save
      if params["company"]["owner_attributes"]["affiliate_check"].present?
        data = create_affliate(params["company"]["owner_attributes"])
        @company.owner.update_columns(:affiliate_id=>data[:affiliate_id] , :affiliate_token=>data[:affiliate_token] )

      end

      render 'companies/signup_success', layout: 'static'
    else
      flash.now[:errors] = @company.errors.full_messages
      render :new
    end
  end

  def profile
    add_breadcrumb @company.name.titleize + ' profile', '#'

    @jobs = @company.jobs.not_system_generated.where(listing_type: 'Job').order(created_at: :desc).limit(5)
    @benches = CandidatesCompany.hot_candidate.where(company_id: @company.id).limit(5)
    @training = @company.jobs.not_system_generated.where(listing_type: 'Training').order(created_at: :desc).limit(5)
    @products = @company.jobs.not_system_generated.where(listing_type: 'Products').order(created_at: :desc).limit(5)
    @services = @company.jobs.not_system_generated.where(listing_type: 'Services').order(created_at: :desc).limit(5)
    @directories = @company.admins.order(created_at: :desc).limit(5)
    @activities = PublicActivity::Activity.where('activities.owner_id = ? or activities.recipient_id = ?', @company.id, @company.id).limit(5)
    @clients = @company.send_or_received_network.limit(5)

    render layout: 'company'
  end

  private

  def redirect_to_main_domain
    return redirect_to "#{HOSTNAME}/register" if (request.subdomain != 'www' && request.subdomain != 'app')
  end

  def find_company
    @company = Company.find(params[:id])
    @new_company = @company
    @company_contacts = current_company.invited_companies.find_by(invited_company_id: params[:id]).try(:invited_company).try(:company_contacts)&.paginate(page: params[:page], per_page: 20) || [] if @company.invited_by.present?
  end

  def company_params
    params.require(:company).permit(:name,  :company_type, :domain, :company_sub_type, :website, :logo, :description, :phone, :email, :linkedin_url, :facebook_url, :twitter_url, :google_url, :is_activated, :status, :tag_line,
                                    owner_attributes: %i[id type first_name last_name email password password_confirmation],
                                    locations_attributes: [:id, :name, :status,
                                                           address_attributes: %i[id address_1 country city state zip_code]] )
  end

  def owner_params
    params.require(:company).require(:owner_attributes).permit(:email, :password, :password_confirmation, :first_name, :last_name  , :affiliate_check )
  end

  def set_domain
    company_domain = domain_from_email(owner_params[:email])

    if FreeEmailProvider.exists?(domain_name: company_domain)
      flash[:notice] = "#{company_domain} is a public email provider. Please use your company email!"
      redirect_to register_path
      return
    end

    @company = Company.find_by(website: company_domain)

    return if params[:register_company]

    if company_exist_with_contact?
      send_activation_email
    elsif company_exist_without_contact?
      create_user
      # handle_user_creation_flow
    else
      redirect_to register_path(email: owner_params[:email], register: true, show_selector: true, show_input: true, site: suggested_slug), notice: 'Please fill in the following details.'
    end
  end

  def company_exist_with_contact?
    @company.present? && associated_contact_exists?
  end

  def company_exist_without_contact?
    @company.present? && !associated_contact_exists?
  end

  def send_activation_email
    redirect_to register_path, error: 'Looks like you already have an account with us. Click on Already have Account? link to Sign In. If you forgot your password, you can request to reset your password.'

    # if @user.send_reset_password_instructions
    #   redirect_to register_path, notice: 'We have sent you password reset instructions.'
    # else
    #   redirect_to register_path, error: 'Something went wrong. Please try again later.'
    # end
  end

  def associated_contact_exists?
    @user = @company.users.find_by(email: owner_params[:email])
    @user.present?
  end

  def handle_user_creation_flow
    if owner_params[:password].present?
      create_user
    else
      redirect_to register_path(show_input: true, email: owner_params[:email], site: @company.slug), notice: 'Add More information to continue.'
    end
  end

  def suggested_slug
    similar_companies = Company.find_like('slug', domain_name(owner_params[:email]))
    existing_companies_count = similar_companies.size

    if similar_companies.present?
      similar_companies.first.slug.concat((existing_companies_count + 1).to_s)
    else
      domain_name(owner_params[:email])
    end
  end

  def create_user
    @user = @company.users.new(owner_params)
    role = @company.roles.find_by(name: "Manager")
    @user.roles << role

    if @user.save
      redirect_to register_path, success: 'We have sent you an email confirmation email.'
    else
      redirect_to register_path, error: "#{@user.errors.full_messages.join(',')}"
    end
  end
end

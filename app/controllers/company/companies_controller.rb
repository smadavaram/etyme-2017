# frozen_string_literal: true

require 'net/http'
class Company::CompaniesController < Company::BaseController
  include DomainExtractor

  before_action :find_admin, only: :change_owner
  before_action :authorized_user, only: %i[show create hot_candidates index network_contacts new company_contacts]
  before_action :find_company, only: %i[edit update destroy add_reminder assign_status create_chat]
  before_action :set_hot_candidates, only: [:hot_candidates]
  before_action :set_company_contacts, only: [:contacts]
  before_action :find_user, only: [:create_chat]
  before_action :find_company_by_email, only: :create

  has_scope :search_by, only: %i[index network_contacts company_contacts]
  respond_to :html, :json
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Companies', companies_path
    respond_to do |format|
      format.html {}
      format.json { render json: CompanyDatatable.new(params, view_context: view_context) }
    end
  end

  def company_contacts
    add_breadcrumb 'Contacts', companies_path

    respond_to do |format|
      format.html {}
      format.json { render json: CompanyContactDatatable.new(params, view_context: view_context) }
    end
  end

  def network_contacts
    @search = current_company.invited_companies.joins(:invited_company).includes(:invited_company).where('companies.email IS NOT NULL').search(params[:q])
    @invited_companies = @search.result.order('companies.created_at DESC') # .paginate(page: params[:page], per_page: 10)
    @company = Company.new
    @company.build_invited_by
  end

  def plugin
    if params[:plugin_type] == 'docusign'
      redirect_to(user_docusign_omniauth_authorize_path)
    elsif params[:plugin_type] == 'zoom'
      redirect_to(user_zoom_omniauth_authorize_path)
    end
  end

  def new
    add_breadcrumb 'Companies', companies_path

    add_breadcrumb 'New'

    @company = Company.new
    @company.build_invited_by
  end

  def edit; end

  def hot_candidates; end

  def hot_index
    add_breadcrumb 'Hot Companies'.humanize, company_company_hot_index_path, title: ''
    @candidates = CandidatesCompany.hot_candidate.where(company_id: current_company.id).paginate(page: params[:page], per_page: 8)
  end

  def create
    if @company && @company == current_company
      if add_current_company_admins
        respond_to do |format|
          flash[:success] = 'Added to your directory.'
          format.html { redirect_to new_company_company_path }
          format.js { flash[:succes] = 'Contact has been added to existing company.' }
        end
      end
    elsif @company
      if @company != current_company
        if current_company.company_contacts.pluck(:email).include?company_contact_params["0"]["email"]
          flash[:success] = 'Company contact already exists'
          redirect_to_new_company
        else
          if create_current_company_contact(current_company)
            flash[:success] = 'Company contact has been added to company'
            redirect_to_new_company
          else
            flash[:errors] = 'Something went wrong while creating the contact'
            redirect_to new_company_company_path, errors: @company.errors.full_messages.first
          end
        end
      end
    else
      create_new_company
    end
  end

  def redirect_to_new_company
    respond_to do |format|
      format.html { redirect_to new_company_company_path, success: 'Contact has been added to existing company.' }
      format.js { flash[:succes] = 'Contact has been added to existing company.' }
    end
  end

  def update
    respond_to do |format|
      format.json do
        current_company.update_attributes(company_params)
        flash[:success] = 'Company Updated Successfully'
        respond_with current_company
      end
      format.html do
        if @company.update_attributes(create_params)
          if params[:company][:branches_attributes].present?
            params[:company][:branches_attributes].each_pair do |mul_field|
              Branch.where(id: params[:company][:branches_attributes][mul_field]['id']).destroy_all unless params[:company][:branches_attributes][mul_field].reject { |p| p == 'id' }.present?
            end
          end
          flash[:success] = 'Company Updated Successfully'
        else
          flash[:errors] = @company.errors.full_messages
        end
        redirect_back fallback_location: root_path
      end
    end
  end

  def contacts; end

  def show
    add_breadcrumb "#{current_company.name} Info"
    @admin = current_company.admins.new
    @company = Company.find(params[:id] || params[:company_id])
    @company.billing_infos.build unless @company.billing_infos.present?
    @company.branches.build unless @company.branches.present?
    @company.addresses.build unless @company.addresses.present?
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
    @location = current_company.locations.build
    @location.build_address
    @slick_pop_up = current_user.sign_in_count <= 5 || params[:onboarding].present? ? '' : 'display_none'
    @customers_list = current_company.company_customer_vendors.customer
    @vendors_list = current_company.company_customer_vendors.vendor

    # pagination
    # @company_docs = current_company.company_docs.paginate(:page => params[:page], :per_page => 15)
  end

  def company_phone_page
    add_breadcrumb 'Phone Page'
  end

  def company_profile_page
    add_breadcrumb "#{current_company.name} profile"
    @jobs = current_company.jobs.not_system_generated.where(listing_type: 'Job').order(created_at: :desc).limit(5)
    @benches = CandidatesCompany.hot_candidate.where(company_id: current_company.id).limit(5)
    @training = current_company.jobs.not_system_generated.where(listing_type: 'Training').order(created_at: :desc).limit(5)
    @products = current_company.jobs.not_system_generated.where(listing_type: 'Products').order(created_at: :desc).limit(5)
    @services = current_company.jobs.not_system_generated.where(listing_type: 'Services').order(created_at: :desc).limit(5)
    @directories = current_company.admins.order(created_at: :desc).limit(5)
    @activities = PublicActivity::Activity.where('activities.owner_id = ? or activities.recipient_id = ?', current_company.id, current_company.id).limit(5)
    @clients = current_company.send_or_received_network.limit(5)
  end

  def company_user_profile_page
    add_breadcrumb 'Company Profile'

    # @jobs = current_company.jobs.not_system_generated.where(:listing_type=>"Job").order(created_at: :desc).limit(5)
    # @benches = CandidatesCompany.hot_candidate.where(company_id: current_company.id ).limit(5)
    # @training = current_company.jobs.not_system_generated.where(:listing_type=>"Training").order(created_at: :desc).limit(5)
    # @products = current_company.jobs.not_system_generated.where(:listing_type=>"Products").order(created_at: :desc).limit(5)
    # @services = current_company.jobs.not_system_generated.where(:listing_type=>"Services").order(created_at: :desc).limit(5)
    # @directories = current_company.admins.order(created_at: :desc).limit(5)
    # @activities = PublicActivity::Activity.where("activities.owner_id = ? or activities.recipient_id = ?", current_company.id, current_company.id).limit(5)
    # @clients = current_company.send_or_received_network.limit(5)
  end

  def destroy
    if @company.destroy
      flash[:success] = 'Company deleted successfully.'
    else
      flash[:errors] = @company.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def update_logo
    render json: current_company.update_attribute(:logo, params[:photo])
    flash.now[:success] = 'Logo Successfully Updated'
  end

  def update_file
    current_company.update_attribute(:company_file, params[:file])
    flash.now[:success] = 'File Successfully Updated'
    redirect_back fallback_location: root_path
  end

  def update_video
    # current_company.id.update_attributes(video: params[:video], video_type: params[:video_type])
    CompanyVideo.create(company_id: current_company.id, video: params[:video], video_type: params[:video_type])
    flash.now[:success] = 'File Successfully Updated'
    # redirect_back fallback_location: root_path

    redirect_to company_path(current_company)
  end

  def update_candidate_docs
    document = CompanyCandidateDoc.find(params['doc_id'])
    document.update_attributes(file: document.file + ',' + params['file'])
    flash.now[:success] = 'File Successfully Updated'
    # redirect_back fallback_location: root_path

    # redirect_to company_path(current_company)
    render json: document
  end

  def update_legal_docs
    document = CompanyLegalDoc.find(params['doc_id'])
    document.update_attributes(file: document.file + ',' + params['file'])
    flash.now[:success] = 'File Successfully Updated'
    # redirect_back fallback_location: root_path

    # redirect_to company_path(current_company)
    render json: document
  end

  def get_admins_list
    @users = Company.find_by_id(params[:id]).admins || []
    respond_to do |format|
      format.js
    end
  end

  def change_owner
    if current_company.update_column(:owner_id, @admin.id)
      flash[:success] = 'Owner Changed'
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    end
  end

  def assign_groups
    @invited_company = current_company.invited_companies.find_by(invited_company_id: params[:company_id])
    if request.post?
      groups = params[:invited_company][:group_ids]
      groups = groups.reject(&:empty?)
      groups_id = groups.map(&:to_i)
      @invited_company.update_attribute(:group_ids, groups_id)
      if @invited_company.save
        flash[:success] = 'Groups has been assigned'
      else
        flash[:errors] = @invited_company.errors.full_messages
      end
      redirect_back fallback_location: root_path
    end
  end

  def assign_groups_to_contact
    @company_contact = CompanyContact.find(params[:company_id])
    # @invited_company = current_company.invited_companies.find_by(invited_company_id: params[:company_id])
    if request.post?
      groups = params[:invited_company][:group_ids]
      groups = groups.reject(&:empty?)
      groups_id = groups.map(&:to_i)
      @company_contact.update_attribute(:group_ids, groups_id)
      # @invited_company.update_attribute(:group_ids, groups_id)
      if @company_contact.save
        flash[:success] = 'Groups has been assigned'
      else
        flash[:errors] = @company_contact.errors.full_messages
      end
      redirect_back fallback_location: root_path
    end
  end

  def download_template
    number = rand(1_000_000_000..9_000_000_000)
    builder = Markio::Builder.new
    builder.bookmarks << Markio::Bookmark.create(
      title: number.to_s
    )
    file_contents = builder.build_string

    File.open(Rails.root.join('app', 'assets', 'images', 'verifyetyme.html').to_s, 'w') { |f| f.write file_contents }

    current_company.update_attributes(verification_code: number)

    send_file Rails.root.join('app', 'assets', 'images', 'verifyetyme.html').to_s,
              type: 'text/html'
  end

  def verify_website
    require 'openssl'
    begin
      doc = Nokogiri::HTML(open("#{params['url']}/verifyetyme.html", ssl_verify_mode: OpenSSL::SSL::VERIFY_NONE))

      if !doc.css('a')[0].nil?
        if current_company.verification_code == doc.css('a')[0].text
          current_company.update_attributes(owner_verified: true)
          flash[:success] = 'Veriy Successfully'
          redirect_back fallback_location: root_path
        else
          flash[:success] = 'Verification code dose not match.'
          redirect_back fallback_location: root_path
        end
      else
        flash[:success] = 'File not found.'
        redirect_back fallback_location: root_path
      end
    rescue StandardError
      flash[:success] = 'File not found.'
      redirect_back fallback_location: root_path
    end
  end

  def authorized_user
    has_access?('manage_company')
  end

  def add_to_network
    @add_to_network = Candidate.signup.find_by(email: params[:email])
    @candidate = CandidatesCompany.new(company_id: current_company.id, candidate_id: @add_to_network.id)
    if @candidate.save
      flash[:success] = 'Added To Your Company Network'
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    else
      flash[:notice] = @candidate.errors.full_messages
      respond_to do |format|
        format.js { render inline: 'location.reload();' }
      end
    end
  end

  def add_reminder; end

  def assign_status; end

  def create_chat
    if request.post?
      @chat = @company.chats.find_by(chatable: current_company)
      @chat = current_company.chats.find_or_initialize_by(chatable: @company) unless @chat.present?
      if @chat.new_record?
        @chat.save
        @chat.chat_users.create(userable: current_user)
        @chat.chat_users.create(userable: @user)
      else
        @chat.chat_users.find_or_create_by(userable: current_user)
        @chat.chat_users.find_or_create_by(userable: @user)
      end
      redirect_to company_chat_path(@chat)
    end
  end

  def update_mobile_number
    @company = Company.find_by_id(params[:id])

    @company&.update_attributes(phone: params['phone_number'], is_number_verify: true)
  end

  private

  def find_company_by_email
    @company = Company.find_by(website: domain_from_email(company_contact_params['0'][:email]))
    # @company = User.find_by(email: company_contact_params["0"][:email])&.company
  end

  def create_new_company
    @company = Company.new(company_params)
    if @company.save
      create_current_company_contact(@company)
      @company.update_attribute(:owner_id, @company.admins.first.id)
      respond_to do |format|
        format.html { redirect_to new_company_company_path, success: 'Successfully Created company.' }
        format.js { flash[:success] = 'Successfully Created company.' }
      end
    else
      respond_to do |format|
        format.html { render :new }
        format.js { flash[:errors] = @company.errors.full_messages }
      end
    end
  end

  def create_new_user
    company_contact_params.each do |_index, params|
      email_domain = valid_email(params[:email])
      next unless User.find_by_email(params[:email]).nil?

      user = if current_company.try(:website) == email_domain
               current_company.admins.new(first_name: params[:first_name], last_name: params[:last_name], email: params[:email], phone: params[:phone], invited_by_id: current_user.id)
             else
               current_company.users.new(first_name: params[:first_name], last_name: params[:last_name], email: params[:email], phone: params[:phone], invited_by_id: current_user.id)
             end
      user.save
    end
  end

  def create_current_company_contact(current_com)
    if current_company && company_contact_params.present?
      company_contact_params.to_h.map do |_key, contact_hash|
        user_params = contact_hash.slice(:first_name, :last_name, :email)
        user = User.find_by_email(contact_hash['email']) || Admin.create(user_params.merge(company_id: @company.id))
        company_contact = current_company.company_contacts.create!(contact_hash.except(:_destroy).merge(user_id: user.id, user_company_id: user.company.id, created_by_id: current_user.id))
      end.all?
    end
  end

  def create_company_contacts_and_admins
    if @company && company_contact_params.present?
      company_contact_params.to_h.map do |_key, contact_hash|
        add_contact_to_company(contact_hash) && add_company_admin(contact_hash)
      end.all?
    end
  end

  def add_current_company_admins
    if @company && company_contact_params.present?
      company_contact_params.to_h.map do |_key, contact_hash|
        add_company_admin(contact_hash)
      end.all?
    end
  end

  def add_new_company_admins
    if @company && company_contact_params.present?
      company_contact_params.to_h.map do |_key, contact_hash|
        add_new_company_admin(contact_hash.merge(invitation_as_contact: true))
      end.all?
    end
  end

  def add_company_admin(admin_hash)
    admin_hash = admin_hash.slice(:first_name, :last_name, :email)
    company_admin = @company.admins.build(admin_hash)
    if company_admin.save
      flash[:success] = "Successful!"
    else
      flash[:errors] = "Cannot Process!"
    end

  end

  def add_new_company_admin(admin_hash)
    contact_hash = admin_hash.slice(:first_name, :last_name, :email, :phone, :title)
    admin_hash = admin_hash.slice(:first_name, :last_name, :email)
    company_admin = @company.admins.build(admin_hash)
    company_admin.save
    if @company.try(:owner_id).nil? && @company.try(:admins).count == 1
      @company.update(owner_id: company_admin.id)
      add_contact_to_current_company(contact_hash)
    end
  end

  def add_contact_to_current_company(contact_hash)
    contact_hash = contact_hash.slice(:first_name, :last_name, :email, :phone, :title)
    @company_contact = current_company.company_contacts.build(contact_hash.merge(created_by_id: current_user.id))
    @company_contact.save
  end

  def add_contact_to_company(contact_hash)
    user_params = contact_hash.slice(:first_name, :last_name, :email, :phone)
    user = User.find_by_email(contact_hash['email']) || User.create(user_params.merge(company_id: @company.id))
    @company_contact = current_company.company_contacts.build(contact_hash.merge(user_id: user.id, user_company_id: user.company.id, created_by_id: current_user.id))
    @company_contact.save
  end

  def find_user
    @user = @company.users.find(params[:user_id]) if request.post?
  end

  def set_company_contacts
    @company_contacts = current_company.invited_companies.find_by(invited_company_id: params[:company_id]).invited_company.company_contacts.paginate(page: params[:page], per_page: 20) || []
  end

  def set_hot_candidates
    @candidates = CandidatesCompany.hot_candidate.where(company_id: params[:company_id]).paginate(page: params[:page], per_page: 8)
  end

  def find_company
    @company = Company.find(params[:id] || params[:company_id])
  end

  def find_admin
    @admin = current_company.admins.find_by_id(params[:admin_id])
  end

  def company_params
    params.require(:company).permit(:name, :company_type, :domain, :skill_list, :website, :logo, :description, :phone, :email, :linkedin_url, :facebook_url, :twitter_url, :google_url, :is_activated, :status, :time_zone, :tag_line, group_ids: [],
                                                                                                                                                                                                                                       owner_attributes: %i[id type first_name last_name email password password_confirmation], locations_attributes: [:id, :name, :status, address_attributes: %i[id address_1 country city state zip_code]],
                                                                                                                                                                                                                                       invited_by_attributes: %i[invited_by_company_id user_id])
  end

  def create_params
    params.require(:company).permit([:name, :email, :domain, :company_type, :currency_id, :phone, :fax_number, :send_email, :slug, :website, group_ids: [],
                                                                                                                                             company_contacts_attributes: %i[id type first_name last_name email company_id phone title _destroy],
                                                                                                                                             invited_by_attributes: %i[invited_by_company_id user_id],
                                                                                                                                             custom_fields_attributes: %i[id name value _destroy]],
                                    addresses_attributes: %i[id address_1 address_2 country city state zip_code],
                                    billing_infos_attributes: %i[id address country city zip],
                                    branches_attributes: %i[id branch_name address country city zip],
                                    departments_attributes: %i[id name])
  end

  def company_contact_params
    create_params[:company_contacts_attributes]
  end
end

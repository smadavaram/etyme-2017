# frozen_string_literal: true

class Company::UsersController < Company::BaseController
  respond_to :js, :json, :html
  add_breadcrumb 'Dashboard', :dashboard_path
  before_action :find_user, only: %i[add_reminder profile]
  has_scope :search_by, only: :dashboard

  def dashboard
    get_cards
    @job_types = { 'Training' => 0, 'Job' => 0, 'Blog' => 0, 'Product' => 0, 'Service' => 0 }.merge(current_company.jobs.group(:listing_type).count)
    if current_company&.vendor?
      @data = []
      respond_to do |format|
        format.js do
          if params[:value] == 'Jobs'
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
          elsif params[:value] == 'Candidates'
            @data += apply_scopes(current_company.candidates)
          elsif params[:value] == 'Contacts'
            @data += apply_scopes(current_company.invited_companies_contacts)
          else
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
            @data += apply_scopes(current_company.invited_companies_contacts)
            @data += apply_scopes(current_company.candidates)
          end
          @data = @data.sort { |y, z| z.created_at <=> y.created_at }
        end
        format.html do
          @directory = current_company.users # .paginate(page: params[:page],per_page: 5)
          @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
          @data += apply_scopes(current_company.invited_companies_contacts)
          @data += apply_scopes(current_company.candidates)
          @data = @data.sort { |y, z| z.created_at <=> y.created_at }
          @jobs_count = current_company.jobs.count
          @applications_count = JobApplication.joins(job: :company).where("jobs.company": current_company)
        end
      end
    end
    @activities = PublicActivity::Activity.where(owner_type: 'Company', owner_id: current_company.prefer_vendors.accepted.pluck(:vendor_id))
                                          .or(PublicActivity::Activity.where(owner_type: 'User', owner_id: User.where(company_id: current_company.prefer_vendors.accepted.pluck(:vendor_id))))
                                          .paginate(page: params[:page], per_page: 15)
  end

  # End of dashboard

  def filter_cards
    respond_to do |format|
      format.js do
        get_cards
      end
    end
  end

  def get_cards
    @cards = {}
    @current_user_cards = {}
    start_date = get_start_date
    end_date = get_end_date
    @cards['JOB'] = current_company.jobs.where(created_at: start_date...end_date).count
    @cards['BENCH JOB'] = current_company.jobs.where(status: 'Bench').where(created_at: start_date...end_date).count
    @cards['BENCH'] = current_company.candidates_companies.hot_candidate.joins(:candidate).where('candidates.created_at': start_date...end_date).count
    @cards['APPLICATION'] = current_company.received_job_applications.where(created_at: start_date...end_date).count
    @cards['STATUS'] = Company.status_count(current_company, start_date, end_date)
    @cards['ACTIVE'] = params[:filter]
    @current_user_cards['JOB'] = Job.where(created_by_id: current_user, created_at: start_date...end_date).count
    @current_user_cards['BENCH JOB'] = Job.where(created_by_id: current_user, status: 'Bench').where(created_at: start_date...end_date).count
    @current_user_cards['APPLICATION'] = JobApplication.joins(:job).where('jobs.created_by_id= ?', current_user)
    @current_user_cards['BENCH'] = current_user.company.candidates_companies.hot_candidate.where('created_at': start_date...end_date).count
  end

  def get_start_date
    filter = params[:filter] || 'year'
    case filter
    when 'period'
      DateTime.parse(params[:start_date]).beginning_of_day
    when 'month'
      DateTime.current.beginning_of_month
    when 'quarter'
      DateTime.current.beginning_of_quarter
    when 'year'
      DateTime.current.beginning_of_year
    end
  end

  def get_end_date
    filter = params[:filter] || 'year'
    case filter
    when 'period'
      DateTime.parse(params[:end_date]).end_of_day
    when 'month'
      DateTime.current.end_of_month
    when 'quarter'
      DateTime.current.end_of_quarter
    when 'year'
      DateTime.current.end_of_year
    end
  end

  def profile
    add_breadcrumb @user.try(:full_name), '#'
  end

  def import
    emails = params[:emails].split(',')
    CompanyContact.transaction do
      emails.each do |email|
        email = email.downcase
        next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

        password = SecureRandom.hex(10)
        user = current_company.admins.where(email: email).first_or_initialize(password_hash)
        user.save! unless user.persisted?
      end
      flash.now[:success] = 'All the email are processed successfully'
    end
  rescue ActiveRecord::RecordInvalid
    flash[:errors] = ["Please check the users' email formats and try again"]
  end

  def add_contacts
    emails = params[:emails].split(',')
    begin
      CompanyContact.transaction do
        emails.each do |email|
          email = email.downcase
          next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

          user = DiscoverUser.new.discover_user(email)
          contact = current_company.company_contacts.where(user: user).first_or_initialize(created_by: current_user, user_company: user.company, email: user.email)
          contact.save! unless contact.persisted?
        end
        flash.now[:success] = 'All the email are processed successfully'
      end
    rescue ActiveRecord::RecordInvalid
      flash[:errors] = ["Please check the contacts' email formats and try again"]
    end
    respond_to do |f|
      f.js {}
    end
  end

  def add_candidates
    emails = params[:emails].split(',')
    begin
      CompanyContact.transaction do
        emails.each do |email|
          email = email.downcase
          next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

          candidate = DiscoverUserdiscover_candidate(email)
          company_candidate = current_company.candidates_companies.normal.where(candidate: candidate).first_or_initialize(candidate: candidate)
          company_candidate.save! unless company_candidate.persisted?
        end
        flash.now[:success] = 'All the email are processed successfully'
      end
    rescue ActiveRecord::RecordInvalid
      flash[:errors] = ["Please check the candidates' email formats and try again"]
    end
    respond_to do |f|
      f.js {}
    end
  end

  def change_owner
    if with_company_domain?
      owner = current_company.admins.where(email: params[:email].downcase).first_or_initialize(password_hash.merge(owner_params))
      if owner.save
        current_company.update(owner_id: owner.id)
        flash.now[:success] = 'Owner/Adminstrator has been changed'
      else
        flash.now[:errors] = owner.errors.full_messages
      end
    else
      flash.now[:errors] = ['Owner must be with company domain']
    end
    respond_to do |f|
      f.js {}
    end
  end

  def update_photo
    render json: current_user.update_attribute(:photo, params[:photo])
    flash.now[:success] = 'Photo Successfully Updated'
  end

  def update_video
    current_user.update_attributes(video: params[:video], video_type: params[:video_type])
    flash.now[:success] = 'File Successfully Updated'
    redirect_back fallback_location: root_path
  end

  def assign_groups
    @user = current_company.users.find(params[:user_id])
    if request.post?
      groups = params[:user][:group_ids]
      groups = groups.reject(&:empty?)
      groups_id = groups.map(&:to_i)
      @user.update_attribute(:group_ids, groups_id)
      if @user.save
        flash[:success] = 'Groups has been assigned'
      else
        flash[:errors] = @user.errors.full_messages
      end
      redirect_back fallback_location: root_path
    end
  end

  def show
    @user = User.find(current_user.id)
    @user.address.build unless @user.address.present?
    add_breadcrumb current_user.try(:full_name), company_user_path
  end

  def update
    if current_user.update_attributes!(user_params)
      if params[:user][:branches_attributes].present?
        params[:user][:branches_attributes].each_key do |mul_field|
          Branch.where(id: params[:user][:branches_attributes][mul_field]['id']).destroy_all unless params[:user][:branches_attributes][mul_field].reject { |p| p == 'id' }.present?
        end
      end
      flash[:success] = 'User Updated'
      redirect_back fallback_location: root_path
    else
      flash[:errors] = current_user.errors.full_messages
      redirect_back fallback_location: root_path
    end
  end

  def add_reminder; end

  def notify_notifications
    add_breadcrumb "#{params[:status]} NOTIFICATIONS", ' #'
    @notifications = current_user.notifications.send(params[:notification_type] || 'all_notifications').where(status: (params[:status] || 0)).page(params[:page]).per_page(10)
  end

  def notification
    @notification = current_user.notifications.find_by(id: params[:id])
    @notification.read!
    @unread_notifications = current_user.notifications.unread.count
  end

  def current_status
    @user = current_user
    respond_with @user
  end

  def status_update
    @user = current_user
    if @user.chat_status == 'available'
      @user.go_unavailable
    else
      @user.go_available
    end
    respond_with @user
  end

  def chat_status_update
    @user = current_user
    if @user.chat_status == 'available'
      @user.go_unavailable
    else
      @user.go_available
    end
    render json: @user
  end

  def destroy
    user = begin
             User.find(params['id'])
           rescue StandardError
             nil
           end
    user.delete unless user.blank?
    redirect_to admins_path
  end

  def onlinestatus
    user = User.find(current_user.id)
    user.update(online_user_status: params[:online_status])
    ActionCable.server.broadcast("online_channel", id: current_user.id, type: "user", current_status: user.online_user_status)
   render json:{data: user.id}
  end

  def application_table_layouts_update
    layout = current_user.application_table_layout || ApplicationTableLayout.new(user: current_user)
    columns = layout.all_columns(params[:job_type])

    columns.each do |col|
      col[:display] = params[:application_table_layout][col[:key]]=='1' ? true : false
    end

    if params[:job_type]=='Bench'
      layout.update_attributes(bench_columns: columns)
    else
      layout.update_attributes(columns: columns)
    end
    redirect_back(fallback_location: root_path)
  end

  private

  def find_user
    @user = User.find_by(id: params[:user_id] || params[:user_id]) || []
  end

  def with_company_domain?
    current_company.domain == Mail::Address.new(params[:email].downcase).domain.split('.').first
  end

  def password_hash
    password = SecureRandom.hex(10)
    { password: password, password_confirmation: password }
  end

  def owner_params
    params.permit(:email, :first_name, :last_name, :phone)
  end

  def user_params
    params.require(:user).permit(:first_name, :last_name, :dob, :email, :age, :phone, :skills, :primary_address_id, :tag_list, :resume, :skill_list, group_ids: [],
                                                                                                                                                     address_attributes: %i[id address_1 address_2 country city state zip_code],
                                                                                                                                                     user_educations_attributes: %i[id degree_level institute degree_title cgpa_grade start_year completion_year _destroy],
                                                                                                                                                     user_certificates_attributes: %i[id title institute start_date end_date _destroy],
                                                                                                                                                     user_work_clients_attributes: %i[id name industry start_date end_date reference_name reference_phone reference_email project_description role _destroy])
  end
end

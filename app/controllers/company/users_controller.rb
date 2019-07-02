class Company::UsersController < Company::BaseController

  respond_to :js, :json, :html
  add_breadcrumb "HOME", :dashboard_path
  before_action :find_user, only: [:add_reminder, :profile]

  has_scope :search_by, only: :dashboard

  def dashboard
    get_cards
    if current_company&.vendor?
      @data = []
      respond_to do |format|
        format.js {
          if params[:value] == 'Jobs'
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
          elsif (params[:value] == 'Candidates')
            @data += apply_scopes(current_company.candidates)
          elsif params[:value] == 'Contacts'
            @data += apply_scopes(current_company.invited_companies_contacts)
          else
            @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
            @data += apply_scopes(current_company.invited_companies_contacts)
            @data += apply_scopes(current_company.candidates)
          end
          @data = @data.sort {|y, z| z.created_at <=> y.created_at}

        }
        format.html {
          @directory = current_company.users #.paginate(page: params[:page],per_page: 5)
          @data += apply_scopes(Job.where(company_id: current_company.prefer_vendor_companies.map(&:id)))
          @data += apply_scopes(current_company.invited_companies_contacts)
          @data += apply_scopes(current_company.candidates)
          @data = @data.sort {|y, z| z.created_at <=> y.created_at}
        }
      end
    end
    @activities = PublicActivity::Activity.order("created_at desc")
  end

  # End of dashboard

  def filter_cards
    respond_to do |format|
      format.js {
        get_cards
      }
    end
  end

  def get_cards
    @cards = {}
    start_date = get_start_date
    end_date = get_end_date
    @cards["JOB"] = current_company.jobs.where(created_at: start_date...end_date).count
    @cards["BENCH JOB"] = current_company.jobs.where(status: 'Bench').where(created_at: start_date...end_date).count
    @cards["BENCH"] = current_company.candidates.where(company_id: current_company.id).where(created_at: start_date...end_date).count
    @cards["APPLICATION"] = current_company.received_job_applications.where(created_at: start_date...end_date).count
    @cards["STATUS"] = Company.status_count(current_company,start_date,end_date)
    @cards["ACTIVE"] = params[:filter]
  end

  def get_start_date
    case params[:filter] ? params[:filter] : 'year'
    when 'period'
      return DateTime.parse(params[:start_date]).beginning_of_day
    when 'month'
      return DateTime.current.beginning_of_month
    when 'quarter'
      return DateTime.current.beginning_of_quarter
    when 'year'
      return DateTime.current.beginning_of_year
    end
  end

  def get_end_date
    case params[:filter] ? params[:filter] : 'year'
    when 'period'
      return DateTime.parse(params[:end_date]).end_of_day
    when 'month'
      return DateTime.current.end_of_month
    when 'quarter'
      return DateTime.current.end_of_quarter
    when 'year'
      return DateTime.current.end_of_year
    end
  end

  def profile
    add_breadcrumb @user.try(:full_name), "#"
  end

  def update_photo
    render json: current_user.update_attribute(:photo, params[:photo])
    flash.now[:success] = "Photo Successfully Updated"
  end

  def update_video
    current_user.update_attributes(video: params[:video], video_type: params[:video_type])
    flash.now[:success] = "File Successfully Updated"
    redirect_back fallback_location: root_path
  end

  def assign_groups
    @user = current_company.users.find(params[:user_id])
    if request.post?
      groups = params[:user][:group_ids]
      groups = groups.reject {|t| t.empty?}
      groups_id = groups.map(&:to_i)
      @user.update_attribute(:group_ids, groups_id)
      if @user.save
        flash[:success] = "Groups has been assigned"
      else
        flash[:errors] = @user.errors.full_messages
      end
      redirect_back fallback_location: root_path
    end
  end

  def show
    @user = User.find(current_user.id)
    @user.address.build unless @user.address.present?
    add_breadcrumb current_user.try(:full_name), :company_user_path
  end

  def update
    if current_user.update_attributes!(user_params)
      if params[:user][:branches_attributes].present?
        params[:user][:branches_attributes].each_key do |mul_field|
          unless params[:user][:branches_attributes][mul_field].reject {|p| p == "id"}.present?
            Branch.where(id: params[:user][:branches_attributes][mul_field]["id"]).destroy_all
          end
        end
      end
      flash[:success] = "User Updated"
      redirect_back fallback_location: root_path
    else
      flash[:errors] = current_user.errors.full_messages
      redirect_back fallback_location: root_path
    end
  end

  def add_reminder

  end

  def notify_notifications
    add_breadcrumb "NOTIFICATIONS", notify_notifications_company_users_path(current_user.id)
    @notifications = current_user.notifications.where(status: (params[:status] || 0), notification_type: (params[:notification_type] || 0)).page(params[:page]).per_page(10)
  end

  def notification
    @notification = current_user.notifications.find_by(id: params[:id])
  end

  def current_status
    @user = current_user
    respond_with @user
  end

  def status_update
    @user = current_user
    if @user.chat_status == "available"
      @user.go_unavailable
    else
      @user.go_available
    end
    respond_with @user
  end

  def chat_status_update
    @user = current_user
    if @user.chat_status == "available"
      @user.go_unavailable
    else
      @user.go_available
    end
    render :json => @user
  end

  def destroy
    user = User.find(params["id"]) rescue nil
    if !user.blank?
      user.delete
    end
    redirect_to admins_path
  end

  private

  def find_user
    @user = current_company.users.find(params[:user_id] || params[:user_id]) || []
  end

  def user_params
    params.require(:user).permit(:first_name, :last_name, :dob, :email, :age, :phone, :skills, :primary_address_id, :tag_list, :resume, :skill_list, group_ids: [],
                                 address_attributes: [:id, :address_1, :address_2, :country, :city, :state, :zip_code],
                                 user_educations_attributes: [:id, :degree_level, :institute, :degree_title, :cgpa_grade, :start_year, :completion_year, :_destroy],
                                 user_certificates_attributes: [:id, :title, :institute, :start_date, :end_date, :_destroy],
                                 user_work_clients_attributes: [:id, :name, :industry, :start_date, :end_date, :reference_name, :reference_phone, :reference_email, :project_description, :role, :_destroy]
    )


  end

end
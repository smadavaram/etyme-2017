class Candidate::CandidatesController < Candidate::BaseController

  respond_to :html,:json,:js

  before_action :set_candidate ,only: [:show,:update]
  before_action :set_chats     ,only: [:dashboard]

  add_breadcrumb 'Candidates', "#", :title => ""

  def dashboard
    @chat = @chats.try(:last)
    @messages = @chat.try(:messages)
    @user = Candidate.find(current_candidate.id)
    @user.address.build unless @user.address.present?
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
    @user.clients.build unless @user.clients.present?
    @user.designations.build unless @user.designations.present?
  end

  def show
    add_breadcrumb current_candidate.full_name.titleize, profile_path, :title => ""
  end

  def update
    respond_to do  |format|
    if current_candidate.update_attributes candidate_params
      if params[:candidate][:educations_attributes].present?
        params[:candidate][:educations_attributes].each_key do |mul_field|
          unless params[:candidate][:educations_attributes][mul_field].reject { |p| p == "id" }.present?
            Education.where(id: params[:candidate][:educations_attributes][mul_field]["id"]).destroy_all
          end
        end
      end
      format.json {respond_with current_candidate}
      format.html {
        flash[:success] = "Candidate Updated"
        redirect_to candidate_candidate_dashboard_path(tab: params[:tab])
      }

    else
      format.html{redirect_back fallback_location: root_path}
      format.json{redirect_back fallback_location: root_path}
    end
    end
  end

  def upload_resume
    if current_candidate.update(resume: params[:resume])
      flash[:success] = "Resume uploaded successfully."
    else
      flash[:errors] = 'Resume not updated'
    end
    redirect_back fallback_location: root_path
  end

  def update_photo
    render json: current_candidate.update_attribute(:photo, params[:photo])
    flash.now[:success] = "Photo Successfully Updated"
  end

  def update_video
    render json: current_candidate.update_attributes(video: params[:video], video_type: params[:video_type])
    flash.now[:success] = "Video Successfully Updated"
  end

  def notify_notifications
    @notifications = current_candidate.notifications || []
    render layout: false
  end

  def get_sub_category
    sub_cat = WORK_CATEGORIES[params[:category]]
    render json: sub_cat
  end

  private

   def set_chats
     @chats = current_candidate.chats
   end

    def set_candidate
      @candidate=Candidate.find_by_id(params[:id])
    end

    def candidate_params
      params.require(:candidate).permit(:first_name,:invited_by ,:job_id,:description, :last_nam,:dob,:email,:phone,:visa, :skill_list,:designate_list, :primary_address_id,:category,:subcategory,dept_name: [],industry_name: [],
                                        address_attributes: [:id,:address_1,:address_2,:country,:city,:state,:zip_code],
                                        educations_attributes: [:id,:degree_level,:degree_title,:grade,:completion_year,:start_year,:institute,:description],
                                        certificates_attributes: [:id,:title,:start_date,:end_date,:institute],
                                        clients_attributes: [:id, :name, :industry, :start_date, :end_date, :project_description, :role, :refrence_name, :refrence_phone, :refrence_email],
                                        designations_attributes: [:id, :comp_name, :recruiter_name, :recruiter_phone, :recruiter_email, :status,])
    end


end

class Candidate::CandidatesController < Candidate::BaseController

  require 'will_paginate/array'
  respond_to :html,:json,:js

  before_action :set_candidate ,only: [:show,:update]
  before_action :set_chats     ,only: [:dashboard]

  add_breadcrumb 'Candidates', "#", :title => ""

  def dashboard
    add_breadcrumb current_candidate.full_name.titleize, profile_path, :title => ""
    @chat = @chats.try(:last)
    @messages = @chat.try(:messages)

    # @jobs = Job.joins("INNER JOIN experiences on jobs.industry = experiences.industry AND jobs.department = experiences.department INNER JOIN candidates on experiences.user_id = candidates.id").order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
    @jobs = Job.order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []


  end

  def show
    @user = Candidate.find(current_candidate.id)
    @user.addresses.build unless @user.addresses.present?
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
    @user.clients.build unless @user.clients.present?
    @user.designations.build unless @user.designations.present?
  end

  def edit_educations
    @user = Candidate.find(current_candidate.id)
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
  end

  def edit_skills
    @user = Candidate.find(current_candidate.id)
  end

  def edit_client_info
    @user = Candidate.find(current_candidate.id)
    @user.clients.build unless @user.clients.present?
  end

  def edit_designate
    @user = Candidate.find(current_candidate.id)
    @user.designations.build unless @user.designations.present?
  end

  def update
    respond_to do  |format|
      if current_candidate.update_attributes candidate_params
        if params[:candidate][:educations_attributes].present?
          params[:candidate][:educations_attributes].each_pair do |mul_field|
            unless params[:candidate][:educations_attributes][mul_field].reject { |p| p == "id" }.present?
              Education.where(id: params[:candidate][:educations_attributes][mul_field]["id"]).destroy_all
            end
          end
        end
        # format.json {respond_with current_candidate}
        # format.html {
        #   flash[:success] = "Candidate Updated"
        #   redirect_to candidate_candidate_dashboard_path(tab: params[:tab])
        # }

        format.json {respond_with current_candidate}
        format.html {
          flash[:success] = "Candidate Updated"
          redirect_to onboarding_profile_path
        }

      else
        format.html{redirect_back fallback_location: root_path}
        format.json{redirect_back fallback_location: root_path}
      end
    end
  end

  def upload_resume

    new_resume = current_candidate.candidates_resumes.new()
    new_resume.resume = params[:resume]
    new_resume.candidate_id = current_candidate.id
    new_resume.is_primary = current_candidate.candidates_resumes.count == 0 ? true : false

    if new_resume.save
      flash[:success] = "Resume uploaded successfully."
    else
      flash[:errors] = 'Resume not updated'
    end

    # if current_candidate.update(resume: params[:resume])
    #   flash[:success] = "Resume uploaded successfully."
    # else
    #   flash[:errors] = 'Resume not updated'
    # end
    redirect_back fallback_location: root_path
  end

  def delete_resume
    resume = CandidatesResume.find(params["id"]) rescue nil
    if resume.is_primary
      resumes = CandidatesResume.where(:candidate_id=>resume.candidate_id).map{|data| data.id}
      resumes.delete(resume.id)
      resume.destroy()
      if resumes.count > 0
        primary_resume = CandidatesResume.find(resumes[0]) rescue nil
        primary_resume.update_attributes(:is_primary=>true)
      end  
    else  
      resume.destroy()
    end  
    redirect_back fallback_location: root_path
  end  

  def make_primary_resume

    resume = CandidatesResume.find(params["id"]) rescue nil

    resumes = CandidatesResume.where(:candidate_id=>resume.candidate_id)
    resumes.each do |data|
      data.update_attributes(:is_primary=>false)
    end  
    resume.update_attributes(:is_primary=>true)

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
    @contract_cycles = current_candidate.contract_cycles.incomplete || []
    render layout: false
  end

  def get_sub_category
    sub_cat = WORK_CATEGORIES[params[:category]]
    render json: sub_cat
  end

  def current_status
    @candidate = current_candidate
    respond_with @candidate
  end

  def status_update

    @candidate = current_candidate
    if @candidate.chat_status == "available"
      @candidate.go_unavailable
    else
      @candidate.go_available
    end
    respond_with @candidate

  end

  def chat_status_update

    @candidate = current_candidate
    if @candidate.chat_status == "available"
      @candidate.go_unavailable
    else
      @candidate.go_available
    end
    # respond_with @candidate
    render :json=>@candidate

  end


  def my_profile

    @user = Candidate.find(current_candidate.id)
    @user.addresses.build unless @user.addresses.present?
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
    @user.clients.build unless @user.clients.present?
    @user.designations.build unless @user.designations.present?
    @sub_cat = WORK_CATEGORIES[@user.category]

  end  

  def onboarding_profile

    @user = Candidate.find(current_candidate.id)
    @user.addresses.build unless @user.addresses.present?
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
    @user.clients.build unless @user.clients.present?
    @user.designations.build unless @user.designations.present?
    @sub_cat = WORK_CATEGORIES[@user.category]

  end  

  def update_mobile_number
    @candidate=Candidate.find_by_id(params[:id])

    if @candidate
      @candidate.update_attributes(:phone=>params["phone_number"], :is_number_verify=> true)
    end  
  end  

  private

   def set_chats
     @chats = current_candidate.chats
   end

    def set_candidate
      @candidate=Candidate.find_by_id(params[:id])
    end

    def candidate_params
      params.require(:candidate).permit(:first_name, :last_name, :invited_by ,:job_id,:description, :last_nam,:dob,:email,:phone,:visa, :skill_list,:designate_list, :primary_address_id,:category,:subcategory,:dept_name,:industry_name, :selected_from_resume, :ever_worked_with_company, :designation_status,
                                        addresses_attributes: [:id,:address_1,:address_2,:country,:city,:state,:zip_code, :from_date, :to_date],
                                        educations_attributes: [:id,:degree_level,:degree_title,:grade,:completion_year,:start_year,:institute,:description,
                                                                :candidate_education_document_attributes => [
                                                                    :id, :education_id, :title, :file, :exp_date
                                                                ]],
                                        certificates_attributes: [:id,:title,:start_date,:end_date,:institute,
                                                                  :candidate_certificate_document_attributes => [
                                                                      :id, :certificate_id, :title, :file, :exp_date
                                                                  ]],
                                        clients_attributes: [:id, :name, :industry, :start_date, :end_date, :project_description, :role, :refrence_name, :refrence_phone, :refrence_email],
                                        documents_attributes: [:id, :candidate_id, :title, :file, :exp_date, :is_education, :is_legal_doc],
                                        legal_documents_attributes: [:id, :candidate_id, :title, :file, :exp_date],
                                        criminal_check_attributes: [:id, :candidate_id, :state, :address, :start_date, :end_date],
                                        visas_attributes: [:id, :candidate_id, :title, :file, :exp_date, :status],
                                        designations_attributes: [:id, :comp_name, :recruiter_name, :recruiter_phone, :recruiter_email, :status, :company_role])
    end


end

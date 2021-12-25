# frozen_string_literal: true

class Candidate::CandidatesController < Candidate::BaseController
  require 'will_paginate/array'
  respond_to :html, :json, :js

  before_action :set_candidate, only: %i[show update]
  before_action :set_chats, only: [:dashboard]

  add_breadcrumb 'Dashboard', :candidate_candidate_dashboard_path

  def dashboard
    respond_to do |format|
      add_breadcrumb current_candidate.full_name.titleize, profile_path
      @chat = @chats.try(:last)
      @messages = @chat.try(:messages)
      get_cards
      # @jobs = Job.joins("INNER JOIN experiences on jobs.industry = experiences.industry AND jobs.department = experiences.department INNER JOIN candidates on experiences.user_id = candidates.id").order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
      @jobs = Job.active.order('id DESC').like_any([:title], params[:q].to_s.split).paginate(page: params[:page], per_page: 10) || []
      @activities = PublicActivity::Activity.order('created_at desc')
      @slick_pop_up = current_candidate.sign_in_count == 1 ? '' : 'display_none'
      format.js {}
      format.html {}
    end
  end

  def companies
    @companies = Company.all
  end

  def groups
    @groups = current_candidate.groups.contact_groups
  end

  def contacts
    @companies = Company.joins(jobs: :job_applications).where("job_applications.applicationable_id = ? AND job_applications.applicationable_type = 'Candidate'", current_candidate.id)
  end

  def expenses
    @expense_accounts = ExpenseAccount.joins(expense: :contract).where("contracts.candidate_id": current_candidate.id)
  end

  def salaries
    @salaries = current_candidate.salaries.includes(:contract_cycle, :contract)
  end

  def bench_invitatons
    @invitations = current_candidates
  end
  def online_candidates_status
    candidate = Candidate.find(current_candidate.id)
    candidate.update(online_candidate_status: params[:online_status])
    ActionCable.server.broadcast("online_channel", id: current_candidate.id, type: "candidate", current_status: candidate.online_candidate_status)
    render json:{data: candidate.id}
  end

  def get_job
    @job = Job.active.find_by(id: params[:id])
    respond_to do |format|
      format.js {}
    end
  end

  def move_to_employer
    @client = current_candidate.clients.find_by(id: params[:client_id])
    @designation = current_candidate.designations.new(start_date: @client.start_date,
                                                      end_date: @client.end_date,
                                                      comp_name: @client.name,
                                                      company_role: @client.role)
    if @designation.save
      flash[:success] = 'Successfully transfer Client to employer'
      @client.destroy
      current_candidate.update(ever_worked_with_company: 'No') if current_candidate.clients.count == 0
    else
      flash[:errors] = @designation.errors.full_messages
    end
    redirect_to onboarding_profile_path(tag: 'skill')
  end

  def filter_cards
    respond_to do |format|
      format.js do
        get_cards
      end
    end
  end

  def get_cards
    @cards = {}
    start_date = get_start_date
    end_date = get_end_date
    @cards['APPLICATION'] = current_candidate.job_applications.where(created_at: start_date...end_date).size
    @cards['STATUS'] = Candidate.application_status_count(current_candidate, start_date, end_date)
    @cards['ACTIVE'] = params[:filter]
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
    @tab = params[:tab]
    respond_to do |format|
      if current_candidate.update_attributes candidate_params
        if params[:candidate][:educations_attributes].present?
          params[:candidate][:educations_attributes].each_pair do |mul_field|
            Education.where(id: params[:candidate][:educations_attributes][mul_field]['id']).destroy_all unless params[:candidate][:educations_attributes][mul_field].reject { |p| p == 'id' }.present?
          end
        end
        # format.json {respond_with current_candidate}
        # format.html {
        #   flash[:success] = "Candidate Updated"
        #   redirect_to candidate_candidate_dashboard_path(tab: params[:tab])
        # }

        format.json { respond_with current_candidate }
        format.html do
          flash[:success] = 'Candidate Updated'
          redirect_to onboarding_profile_path(tag: params['tab']) unless @tab.eql?('fln_basic_info')
        end
        format.js do
          flash.now[:success] = 'Candidate Profile Updated'
        end

      else
        format.html { redirect_back fallback_location: root_path }
        format.json { redirect_back fallback_location: root_path }
        format.js { render json: :ok }
      end
    end
  end

  def build_profile
    resume = current_candidate.candidates_resumes.find_by(id: params[:id])
    response = ResumeParser.new(resume.resume).sovren_parse
    begin
      if response.code == '200'
        parsed_hash = JSON.parse(JSON.parse(response.body)['Value']['ParsedDocument'])['Resume']
        current_candidate.sovren_build_profile(parsed_hash)
        flash[:success] = 'Profile build request from resume is processed'
      else
        flash[:errors] = [response.body]
      end
    rescue StandardError => e
      flash[:errors] = [e]
    end
    redirect_to onboarding_profile_path(tag: 'verify-phone')
  end

  def upload_resume
    new_resume = current_candidate.candidates_resumes.new
    new_resume.resume = params[:resume]
    new_resume.candidate_id = current_candidate.id
    new_resume.is_primary = current_candidate.candidates_resumes.empty?
    if new_resume.save
      flash[:success] = 'Resume uploaded successfully.'
    else
      flash[:errors] = ['Resume not updated']
    end
    respond_to do |format|
      format.js {}
    end
  end

  def delete_resume
    if params[:id].present?
      resume = CandidatesResume.find_by(id: params['id'])
      if resume.is_primary
        resumes = CandidatesResume.where(candidate_id: resume.candidate_id).map(&:id)
        resumes.delete(resume.id)
        resume.destroy
        unless resumes.empty?
          primary_resume = CandidatesResume.find_by(id: resumes[0])
          primary_resume.update_attributes(is_primary: true)
        end
        flash.now[:success] = !resumes.empty? ? 'Selected Resume has been destroy and First Resume status mark as primary' : 'Resume Destroy Successfully'

      else
        resume.destroy
        flash.now[:success] = 'Resume Destroy Successfully'
      end
    end
    render 'upload_resume'
    # redirect_back fallback_location: root_path
  end

  def make_primary_resume
    return unless params[:id].present?

    resume = CandidatesResume.find_by(id: params['id'])
    resumes = CandidatesResume.where(candidate_id: resume.candidate_id)
    resumes.update_all(is_primary: false)
    resume.update_attributes(is_primary: true)
    render 'upload_resume'
  end

  def update_photo
    render json: current_candidate.update_attribute(:photo, params[:photo])
    flash.now[:success] = 'Photo Successfully Updated'
  end

  def update_video
    render json: current_candidate.update_attributes(video: params[:video], video_type: params[:video_type])
    flash.now[:success] = 'Video Successfully Updated'
  end

  def notification
    @notification = current_candidate.notifications.find_by(id: params[:id])
    @notification.read!
    @unread_notifications = current_candidate.notifications.unread.count
  end

  def notify_notifications
    add_breadcrumb 'NOTIFICATIONS', '#'
    if params[:status] != "all_notifications"
      @notifications = current_candidate.notifications.send(params[:notification_type] || 'all_notifications').where(status: (params[:status] || 0)).page(params[:page]).per_page(10)
    else 
      @notifications = current_candidate.notifications.send(params[:notification_type] || 'all_notifications').page(params[:page]).per_page(10)
    end
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
    if @candidate.chat_status == 'available'
      @candidate.go_unavailable
    else
      @candidate.go_available
    end
    respond_with @candidate
  end

  def chat_status_update
    if current_candidate.chat_status == 'available'
      current_candidate.go_unavailable
    else
      current_candidate.go_available
    end
    # respond_with @candidate
    render json: current_candidate
  end

  def my_profile
    redirect_to 'app.etyme.com' + my_profile_path(candidate_name: current_candidate.full_name_friendly) if Rails.env.production?
    @user = current_candidate
    @user.addresses.build unless @user.addresses.present?
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
    @user.clients.build unless @user.clients.present?
    @user.designations.build unless @user.designations.present?
    @sub_cat = WORK_CATEGORIES[@user.category]
  end

  def onboarding_profile
    add_breadcrumb 'Onboard profile', onboarding_profile_path

    @user = current_candidate
    @user.addresses.build unless @user.addresses.present?
    @user.educations.build unless @user.educations.present?
    @user.certificates.build unless @user.certificates.present?
    @user.clients.build unless @user.clients.present?
    @user.designations.build unless @user.designations.present?
    @sub_cat = WORK_CATEGORIES[@user.category]
    @tab = params['tag']
  end

  def update_mobile_number
    @tab = 'verify-phone'
    current_candidate.update_attributes(phone: params['phone_number'], is_number_verify: true) if current_candidate.present?
  end

  private

  def set_chats
    @chats = current_candidate.chats
  end

  def set_candidate
    @candidate = Candidate.find_by_id(params[:id])
  end

  def candidate_params
    params.require(:candidate).permit(:first_name, :last_name, :invited_by, :ssn, :passport_number, :relocation, :visa_type, :job_id, :description, :last_nam, :dob, :email, :phone_country_code, :phone, :visa, :skill_list, :designate_list, :primary_address_id, :category, :subcategory, :dept_name, :industry_name, :selected_from_resume, :ever_worked_with_company, :designation_status, :facebook_url, :twitter_url, :linkedin_url, :gtalk_url, :skypeid, :address,
                                      addresses_attributes: %i[id address_1 address_2 country city state zip_code from_date to_date _destroy],
                                      educations_attributes: [:id, :degree_level, :degree_title, :grade, :completion_year, :start_year, :institute, :description, :_destroy,
                                                              candidate_education_documents_attributes: %i[
                                                                id education_id title file exp_date _destroy
                                                              ]],
                                      certificates_attributes: [:id, :title, :start_date, :end_date, :institute, :_destroy,
                                                                candidate_certificate_documents_attributes: %i[
                                                                  id certificate_id title file exp_date _destroy
                                                                ]],
                                      clients_attributes: [:id, :name, :industry, :start_date, :end_date, :project_description, :role, :refrence_name, :refrence_phone, :refrence_phone_country_code, :refrence_email, :refrence_two_name, :refrence_two_phone_country_code, :refrence_two_phone, :refrence_two_email, :_destroy,
                                                           designation_attributes: %i[id comp_name client_id candidate_id recruiter_name recruiter_phone recruiter_phone_country_code recruiter_email start_date end_date status company_role _destroy],
                                                           portfolios_attributes: %i[id name description cover_photo _destroy]],
                                      portfolios_attributes: %i[id name description cover_photo _destroy],
                                      documents_attributes: %i[id candidate_id title file exp_date is_education is_legal_doc _destroy],
                                      legal_documents_attributes: %i[id candidate_id document_number start_date title file exp_date _destroy],
                                      criminal_check_attributes: %i[id candidate_id state address start_date end_date _destroy],
                                      visas_attributes: %i[id candidate_id title file visa_number start_date exp_date status _destroy],
                                      designations_attributes: [:id, :comp_name, :recruiter_name, :recruiter_phone, :recruiter_phone_country_code, :recruiter_email, :start_date, :end_date, :status, :company_role, :_destroy,
                                                                portfolios_attributes: %i[id name description cover_photo _destroy]])
  end
end

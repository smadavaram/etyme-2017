class Static::JobApplicationsController < ApplicationController

  before_action :find_job ,only: :create

  def create
    JobApplication
    if params[:candidate_id].present? || current_candidate
      @freelance_company = Company.find_by(company_type: :vendor, domain: 'freelancer.com')
      current_candidate.update_attributes(company_id: @freelance_company.id)
      @job_application = current_candidate.job_applications.new(job_application_params.merge(job_id: params[:job_id], application_type: :direct))
      save_job_application(@job_application)
    else
      if params["candidate_without_registration"].present?
        if params["job_application"]["job_application_without_registrations"]["email"]
          data_params = params["job_application"]["job_application_without_registrations"]
          @freelance_company = Company.find_by(company_type: :vendor, domain: 'freelancer.com')
          candidate = Candidate.find_by_email(data_params["email"])||Candidate.create(:email => data_params["email"], :first_name => data_params["first_name"], :last_name => data_params["last_name"],
                                       :phone => data_params["phone"], :company_id => @freelance_company.id)
          @job_application = candidate.job_applications.new(job_application_params.merge(job_id: params[:job_id], application_type: :witout_registration, company_id: @job.company_id))
          save_job_application(@job_application)
        end
      elsif params["candidate_with_recruiter"].present?
        if params["job_application"]["candidate_with_recruiter"]["email"]
          data_params = params["job_application"]["candidate_with_recruiter"]
          email = params["job_application"]["candidate_with_recruiter"]["recruiter_email"]
          domain = email.split("@")[1]
          companies = Company.where(domain: domain.split('.').first)
          if !companies.blank?
            @company = companies.first
            # TODO: as it as user of recruiter company
            candidate = Candidate.find_by(email: data_params["email"]) || Candidate.create(:email => data_params["email"], :first_name => data_params["first_name"], :last_name => data_params["last_name"], :phone => data_params["phone"], :company_id => @company.id)
            @job_application = candidate.job_applications.new(job_application_params.merge(job_id: params[:job_id],application_type: :with_recurator,company_id: @job.company_id))
            save_job_application(@job_application)
          else
            @company = Company.new()
            @company.name = domain.split(".")[0]
            @company.website = domain
            @company.phone = params["job_application"]["candidate_with_recruiter"]["phone"]
            @company.domain = domain.split(".")[0]
            if @company.valid? && @company.save
              owner = @company.admins.create(email: email)
              @company.update(owner_id: owner.id)
              candidate = Candidate.find_by_email(data_params["email"]) || Candidate.create(:email => data_params["email"], :first_name => data_params["first_name"], :last_name => data_params["last_name"], :phone => data_params["phone"], :company_id => @company.id)
              @job_application = candidate.job_applications.new(job_application_params.merge(job_id: params[:job_id],application_type: :with_recurator,company_id: @job.company_id))
              save_job_application(@job_application)
            else
              flash[:errors] = @company.errors.full_messages
            end
          end
        end
      end
    end
    if params[:is_candidate] == "true"
      job = Job.find(params[:job_id])
      job.update_attribute('is_bench_job', true)
    end
    redirect_back fallback_location: root_path
  end

  def save_job_application(job_application)
    if job_application.save
      flash[:success] = "Job Application Created"
    else
      flash[:errors] = job_application.errors.full_messages
    end
  end

  def job_application_params
    params.require(:job_application).permit([ :message ,:available_to_join,:total_experience,:relevant_experience,:rate_per_hour,:available_from,:available_to,:applicant_resume, :cover_letter ,:candidate_email,:candidate_first_name,:candidate_last_name, :status, custom_fields_attributes:
        [
            :id,
            :name,
            :value
        ],job_applicant_reqs_attributes: [:id, :job_requirement_id, :applicant_ans, app_multi_ans: []],
        job_applicantion_without_registrations_attributes: [:id, :first_name, :last_name, :email, :phone, :location, :skill, :visa, :title, :roal, :resume, :is_registerd ],
        job_applicantion_with_recruiters_attributes: [:id, :first_name, :last_name, :email, :phone, :location, :skill, :visa, :title, :roal, :resume, :is_registerd ]])
  end
  def find_job
    @job=Job.active.is_public.where(id: params[:id]|| params[:job_id]).first
  end
end

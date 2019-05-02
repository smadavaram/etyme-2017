class Static::JobApplicationsController < ApplicationController

  before_action :find_job ,only: :create

  def create
    JobApplication
    if params[:candidate_id].present? || current_candidate
      @job_application = current_candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
      if @job_application.save
        flash[:success] = "Job Application Created"
      else
        flash[:errors] = @job_application.errors.full_messages
      end
      # # @candidate = Candidate.where(id: params[:candidate_id].split(" ").map(&:to_i))
      # @candidate = Candidate.where(id: current_candidate.id)
      # @candidate.each do |candidate|
      #   @job_application=candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
      #   @job_application.save
      # end
    else
      if params["candidate_without_registration"].present?

        if params["job_application"]["job_application_without_registrations"]["email"]
          data_params = params["job_application"]["job_application_without_registrations"]
          candidate = Candidate.create(:email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] )
          @job_application = candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
          if @job_application.save!
              flash[:success] = "Job Application Created"
            else
              flash[:errors] = @job_application.errors.full_messages
            end
        end
        if @job_application.save!
          flash[:success] = "Job Application Created"
        else
          flash[:errors] = @job_application.errors.full_messages
        end
      elsif params["candidate_with_recruiter"].present?
        if params["job_application"]["candidate_with_recruiter"]["email"]

          data_params = params["job_application"]["candidate_with_recruiter"]
          email = params["job_application"]["candidate_with_recruiter"]["recruiter_email"]

          domain = email.split("@")[1]

          companies = Company.where(domain: domain.split('.').first)
          if !companies.blank?

            @company = companies.first

            company_contact = @company.company_contacts.find_by(email: data_params["email"]) || CompanyContact.create(:company_id=> @company.id, :email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] , :title=>data_params["title"] )
            candidate = Candidate.find_by(email: data_params["email"]) || Candidate.create(:email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] )

            @job_application = candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))


            if @job_application.save

              @job_ap_with_rec = JobApplicationWithRecruiter.new()
              @job_ap_with_rec.first_name = data_params["first_name"]
              @job_ap_with_rec.last_name = data_params["last_name"]
              @job_ap_with_rec.email = data_params["email"]
              @job_ap_with_rec.phone = data_params["phone"]
              @job_ap_with_rec.location = data_params["location"]
              @job_ap_with_rec.skill = data_params["skill"]
              @job_ap_with_rec.visa = data_params["visa"]
              @job_ap_with_rec.title = data_params["title"]
              @job_ap_with_rec.roal = data_params["roal"]
              @job_ap_with_rec.resume = data_params["resume"]
              @job_ap_with_rec.job_application_id = @job_application.id
              @job_ap_with_rec.is_registerd = data_params["is_registerd"]
              @job_ap_with_rec.recruiter_email = data_params["recruiter_email"]
              @job_ap_with_rec.save 

              flash[:success] = "Job Application Created"
            else
              flash[:errors] = @job_application.errors.full_messages
            end 
          else
            @company = Company.new()

            @company.name = domain.split(".")[0]
            @company.website = domain
            @company.phone = params["job_application"]["candidate_with_recruiter"]["phone"]
            @company.domain = domain 
            # respond_to do |format|r
              if @company.valid? && @company.save
                company_contact = CompanyContact.create(:company_id=> @company.id, :email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] , :title=>data_params["title"] )
                candidate = Candidate.find_by(email: data_params["email"]) || Candidate.create(:email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] )

                @job_application = candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))

                if @job_application.save
                  flash[:success] = "Job Application Created"
                else
                  flash[:errors] = @job_application.errors.full_messages
                end 
              else
                flash[:errors] = @company.errors.full_messages
              end
            # end
          end  

        end  

        if @job_application.save
          flash[:success] = "Job Application Created"
        else
          flash[:errors] = @job_application.errors.full_messages
        end
        
      end  
    end
    if params[:is_candidate] == "true"
      job = Job.find(params[:job_id])
      job.update_attribute('is_bench_job', true)
    end
    redirect_back fallback_location: root_path
  end

  def job_application_params
    params.require(:job_application).permit([ :message ,:applicant_resume, :cover_letter ,:candidate_email,:candidate_first_name,:candidate_last_name, :status, custom_fields_attributes:
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

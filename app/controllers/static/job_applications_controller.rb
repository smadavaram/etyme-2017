class Static::JobApplicationsController < ApplicationController

  before_action :find_job ,only: :create

  def create
    JobApplication
    if params[:candidate_id].present?
      @candidate = Candidate.where(id: params[:candidate_id].split(" ").map(&:to_i))
      @candidate.each do |candidate|
        @job_application=candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
        @job_application.save
      end
    else
      if params["candidate_without_registration"].present?

        if params["job_application"]["job_application_without_registrations"]["email"]

          data_params = params["job_application"]["job_application_without_registrations"]
          email = params["job_application"]["job_application_without_registrations"]["email"]

          domain = email.split("@")[1]

          companies = Company.where(domain: domain)

          if !companies.blank?

            @company = companies.first

            company_contact = CompanyContact.create(:company_id=> @company.id, :email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] , :title=>data_params["title"] )
            candidate = Candidate.create(:email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] )

            @job_application = candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))

            if @job_application.save
              flash[:success] = "Job Application Created"
            else
              flash[:errors] = @job_application.errors.full_messages
            end 
          else
            total_slug = Company.where("slug like ?", "#{domain.split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}_").count
            @company = Company.new()

            @company.name = domain.split(".")[0]
            @company.website = domain
            @company.phone = params["job_application"]["job_application_without_registrations"]["phone"]
            @company.domain = domain 
           
            if total_slug == 0
              @company.slug = "#{domain.split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}"
            else
              @company.slug = "#{domain.split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}" + "#{total_slug +1}"
            end  

            # respond_to do |format|
              if @company.valid? && @company.save
                company_contact = CompanyContact.create(:company_id=> @company.id, :email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] , :title=>data_params["title"] )
                candidate = Candidate.create(:email=>data_params["email"], :first_name=>data_params["first_name"] , :last_name=>data_params["last_name"] , :phone=>data_params["phone"] )

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
        job_applicantion_without_registrations_attributes: [:id, :first_name, :last_name, :email, :phone, :location, :skill, :visa, :title, :roal, :resume, :is_registerd ]])
  end
  def find_job
    @job=Job.active.is_public.where(id: params[:id]|| params[:job_id]).first
  end

end

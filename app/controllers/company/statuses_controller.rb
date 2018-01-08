class Company::StatusesController < Company::BaseController

  before_action :set_statuses , only: [:index]
  add_breadcrumb "HOME", :dashboard_path

  def create
    @status = current_user.statuses.new(status_params)
    if @status.save
      flash[:success] =  "Status created successfully."
      else
      flash[:errors] = @status.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  #index for a company and  candidate status log
  def index
  end

  def create_bulk_candidates
    params[:candidates_ids].split(",").each do |c_id|
      current_company.candidates.find(c_id.to_i).statuses.create(note: params[:status][:note] ,status_type: params[:status][:status_type],user_id: current_user.id)
    end
    flash[:success] = "Status Assigned."
    redirect_back fallback_location: root_path
  end
  def create_bulk_companies
    params[:company_ids].split(',').each do |c_id|
      current_company.invited_companies.find_by(invited_company: c_id.to_i).invited_company.statuses.create(status_type: params[:status][:status_type] ,note:params[:status][:note],user_id: current_user.id)
    end
    flash[:success] = "Status Assigned."
    redirect_back fallback_location: root_path
  end

  private

    def set_statuses
      if(params[:type]=='Candidate')
        @candidate = current_company.candidates.find(params[:id])
        @statuses = @candidate.statuses
      elsif params[:type]=='Company'
        @company = current_company.invited_companies.find_by(invited_company: params[:id]).invited_company
        @statuses = @company.statuses
      end
    end

   def status_params
     params.require(:status).permit(:status_type,:note,:statusable_type,:statusable_id,:user_id)
   end
end

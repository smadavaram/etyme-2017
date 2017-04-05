class Company::StatusesController < Company::BaseController

  def create
    @status = current_user.statuses.new(status_params)
    if @status.save
      flash[:success] =  "Status created successfully."
      else
      flash[:errors] = @status.errors.full_messages
    end
    redirect_to :back
  end

  def create_bulk_candidates
    params[:candidate_ids].each do |c_id|
      current_company.candidates.find(c_id).statuses.create(note: params[:status][:note] ,status_type: params[:status][:status_type],user_id: current_user.id)
    end
    flash[:success] = "Status Assigned."
    redirect_to :back
  end
  def create_bulk_companies
    params[:company_ids].each do |c_id|
      current_company.invited_companies.find_by(invited_company: c_id).invited_company.statuses.create(status_type: params[:status][:status_type] ,note:params[:status][:note],user_id: current_user.id)
    end
    flash[:success] = "Status Assigned."
    redirect_to :back
  end

  private
   def status_params
     params.require(:status).permit(:status_type,:note,:statusable_type,:statusable_id,:user_id)
   end
end

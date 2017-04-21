class Company::GroupsController < Company::BaseController

  before_action :set_and_find_group ,only: [:update,:edit]
  add_breadcrumb "Groups", :groups_path, options: { title: "COMPANY Groups" }

  def new
    @group = current_company.groups.new
  end

  def edit

  end

  def update
    if @group.update(group_params)
      flash[:success] = "Group has been successfully updated"
      redirect_to groups_path
    else
      flash[:errors] = @group.errors.full_messages
      redirect_to groups_path
    end
  end

  def index
    @groups = current_company.groups || []
  end


  def create
    @group = current_company.groups.create(group_params)
    if @group.save
      flash[:success] = "New Group has been successfully created"
      redirect_to groups_path
    else
      flash[:errors] = @group.errors.full_messages
      redirect_to groups_path
    end
  end

  def create_bulk_candidates
    params[:candidates_ids].split(',').each do |c_id|
      @candidate = current_company.candidates.find(c_id.to_i)
      @candidate.update_attribute(:group_ids, params[:group_ids])
    end
    flash[:success] = "Groups Assigned"
    redirect_to :back
  end
  def create_bulk_companies
    params[:company_ids].each do |c_id|
      @invited_company = current_company.invited_companies.find_by(invited_company_id: c_id)
      @invited_company.update_attribute(:group_ids, params[:group_ids])
    end
    flash[:success] = "Groups Assigned"
    redirect_to :back
  end

  private

 def  set_and_find_group
   @group = current_company.groups.find(params[:id])
 end

  def group_params
    params.require(:group).permit(:group_name,candidate_ids: [])
  end
end

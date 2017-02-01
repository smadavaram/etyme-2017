class Company::GroupsController < Company::BaseController

  before_action :set_and_find_group ,only: [:update,:edit]


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


  private
 def  set_and_find_group
   @group = current_company.groups.find(params[:id])
 end

  def group_params
    params.require(:group).permit(:group_name,candidate_ids: [])
  end
end

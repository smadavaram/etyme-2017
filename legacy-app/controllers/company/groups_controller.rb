# frozen_string_literal: true

class Company::GroupsController < Company::BaseController
  before_action :set_and_find_group, only: %i[update edit assign_status add_reminder]
  add_breadcrumb 'Dashboard', :dashboard_path

  def new
    add_breadcrumb 'Group(S)', groups_path
    add_breadcrumb 'new'

    @group = current_company.groups.new
  end

  def edit; end

  def update
    if @group.update(group_params)
      flash[:success] = 'Group has been successfully updated'
      redirect_to groups_path
    else
      flash[:errors] = @group.errors.full_messages
      redirect_to groups_path
    end
  end

  def index
    add_breadcrumb 'Group(S)', groups_path
    respond_to do |format|
      format.html {}
      format.json { render json: GroupDatatable.new(params, view_context: view_context) }
    end
  end

  def add_reminder; end

  def assign_status; end

  def create
    @group = current_company.groups.create(group_params)
    if @group.save
      flash[:success] = 'New Group has been successfully created'
      if @group.member_type == 'Candidate'
        redirect_to candidates_path
      elsif @group.member_type == 'Contact'
        redirect_to network_contacts_company_companies_path
      elsif @group.member_type == 'Directory'
        redirect_to directories_path
      else
        redirect_to groups_path
      end
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
    flash[:success] = 'Groups Assigned'
    redirect_back fallback_location: root_path
  end

  def create_bulk_companies
    params[:company_ids].split(',').each do |c_id|
      @invited_company = current_company.invited_companies.find_by(invited_company_id: c_id.to_i)
      @invited_company.update_attribute(:group_ids, params[:group_ids])
    end
    flash[:success] = 'Groups Assigned'
    redirect_back fallback_location: root_path
  end

  def create_bulk_contacts
    params[:candidates_ids].split(',').each do |c_id|
      # @candidate = current_company.candidates.find(c_id.to_i)
      # @candidate.update_attribute(:group_ids, params[:group_ids])
      @company_contact = CompanyContact.find(c_id.to_i)
      @company_contact.update_attribute(:group_ids, params[:group_ids])
    end
    flash[:success] = 'Groups Assigned'
    redirect_back fallback_location: root_path
  end

  def destroy
    group = begin
              Group.find(params['id'])
            rescue StandardError
              nil
            end

    group.destroy
    flash[:success] = 'Groups Deleted'
    redirect_back fallback_location: root_path
  end

  def remove_from_group
    Groupable.where(id: params[:groupable]).destroy_all
    redirect_to company_conversations_path(conversation: params[:conversation])
  end

  def leave_group
    grp = Group.find(params[:group])
    grp.groupables.where(groupable: current_user).destroy_all
    redirect_to company_conversations_path
  end

  private

  def set_and_find_group
    @group = current_company.groups.find(params[:id])
  end

  def group_params
    params.require(:group).permit(:group_name, :member_type, candidate_ids: [])
  end
end

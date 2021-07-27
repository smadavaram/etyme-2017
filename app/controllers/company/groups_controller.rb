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

    # view_context = "{'recordsTotal':4,'recordsFiltered':4,'data':[{'id':'7','name':'\u003cspan class=\'ellipsis\' title=\'Client contacts\'\u003eClient contacts\u003c/span\u003e','type':'Contact','member':'2','created_at':'\u003cspan style=\'color: #1AAE9F\'\u003e11 of March, 2021\u003c/span\u003e','reminder_note':'','status':'\u003ca data-confirm=\'Are you sure?\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'delete\' href=\'/groups/7\'\u003e\u003ci class=\'os-icon os-icon-ui-15\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'Block Group\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'post\' href=\'/company/black_listers/ban/7/type/Group\'\u003e\u003ci class=\'os-icon os-icon-lock\'\u003e\u003c/i\u003e\u003c/a\u003e','contact':'\u003ca title=\'Chat\' class=\'data-table-icons\' data-remote=\'true\' href=\'/company/conversations/mini_chat?conversation_id=13\'\u003e\u003ci class=\'fa fa-comment-o ChatBtn\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'\' class=\'data-table-icons\' href=\'mailto:%5B%5D\'\u003e\u003ci class=\'os-icon os-icon-email-2-at2\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca class=\'data-table-icons\' href=\'skype:?call\'\u003e\u003ci class=\'os-icon os-icon-phone \'\u003e\u003c/i\u003e\u003c/a\u003e\u003cdiv title = 'Add to Calendar' class = 'addeventatc z-100' style= 'margin-top: 6px;'\u003e\n          \u003cspan class = 'start' \u003e06/10/2019 08:00 AM\u003c/span\u003e\n          \u003cspan class='end'\u003e06/10/2019 10:00 AM\u003c/span\u003e\n          \u003cspan class='timezone'\u003eAmerica/Los_Angeles \u003c/span\u003e\n          \u003cspan class='title'\u003e\u003c/span\u003e\n          \u003cspan class = 'description' \u003e\u003c/span\u003e\n          \u003cspan class='os-icon os-icon-calendar' style='color: red'\u003e\u003c/span\u003e\n          \u003cspan class='attendees'\u003e\u003c/span\u003e\n        \u003c/div \u003e','actions':'\u003ca title=\'Remind Me\' class=\'data-table-icons\' data-remote=\'true\' rel=\'nofollow\' data-method=\'post\' href=\'/groups/7/add_reminder\'\u003e\u003ci class=\'picons-thin-icon-thin-0014_notebook_paper_todo\'\u003e\u003c/i\u003e\u003c/a\u003e'},{'id':'45','name':'\u003cspan class=\'ellipsis\' title=\'Vendor\'\u003eVendor\u003c/span\u003e','type':'Contact','member':'0','created_at':'\u003cspan style=\'color: #1AAE9F\'\u003e23 of April, 2021\u003c/span\u003e','reminder_note':'','status':'\u003ca data-confirm=\'Are you sure?\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'delete\' href=\'/groups/45\'\u003e\u003ci class=\'os-icon os-icon-ui-15\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'Block Group\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'post\' href=\'/company/black_listers/ban/45/type/Group\'\u003e\u003ci class=\'os-icon os-icon-lock\'\u003e\u003c/i\u003e\u003c/a\u003e','contact':'\u003ca title=\'Chat\' class=\'data-table-icons\' data-remote=\'true\' href=\'/company/conversations/mini_chat?conversation_id=88\'\u003e\u003ci class=\'fa fa-comment-o ChatBtn\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'\' class=\'data-table-icons\' href=\'mailto:%5B%5D\'\u003e\u003ci class=\'os-icon os-icon-email-2-at2\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca class=\'data-table-icons\' href=\'skype:?call\'\u003e\u003ci class=\'os-icon os-icon-phone \'\u003e\u003c/i\u003e\u003c/a\u003e\u003cdiv title = 'Add to Calendar' class = 'addeventatc z-100' style= 'margin-top: 6px;'\u003e\n          \u003cspan class = 'start' \u003e06/10/2019 08:00 AM\u003c/span\u003e\n          \u003cspan class='end'\u003e06/10/2019 10:00 AM\u003c/span\u003e\n          \u003cspan class='timezone'\u003eAmerica/Los_Angeles \u003c/span\u003e\n          \u003cspan class='title'\u003e\u003c/span\u003e\n          \u003cspan class = 'description' \u003e\u003c/span\u003e\n          \u003cspan class='os-icon os-icon-calendar' style='color: red'\u003e\u003c/span\u003e\n          \u003cspan class='attendees'\u003e\u003c/span\u003e\n        \u003c/div \u003e','actions':'\u003ca title=\'Remind Me\' class=\'data-table-icons\' data-remote=\'true\' rel=\'nofollow\' data-method=\'post\' href=\'/groups/45/add_reminder\'\u003e\u003ci class=\'picons-thin-icon-thin-0014_notebook_paper_todo\'\u003e\u003c/i\u003e\u003c/a\u003e'},{'id':'52','name':'\u003cspan class=\'ellipsis\' title=\'.net\'\u003e.net\u003c/span\u003e','type':'Candidate','member':'0','created_at':'\u003cspan style=\'color: #1AAE9F\'\u003e01 of May, 2021\u003c/span\u003e','reminder_note':'','status':'\u003ca data-confirm=\'Are you sure?\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'delete\' href=\'/groups/52\'\u003e\u003ci class=\'os-icon os-icon-ui-15\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'Block Group\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'post\' href=\'/company/black_listers/ban/52/type/Group\'\u003e\u003ci class=\'os-icon os-icon-lock\'\u003e\u003c/i\u003e\u003c/a\u003e','contact':'\u003ca title=\'Chat\' class=\'data-table-icons\' data-remote=\'true\' href=\'/company/conversations/mini_chat?conversation_id=100\'\u003e\u003ci class=\'fa fa-comment-o ChatBtn\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'\' class=\'data-table-icons\' href=\'mailto:%5B%5D\'\u003e\u003ci class=\'os-icon os-icon-email-2-at2\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca class=\'data-table-icons\' href=\'skype:?call\'\u003e\u003ci class=\'os-icon os-icon-phone \'\u003e\u003c/i\u003e\u003c/a\u003e\u003cdiv title = 'Add to Calendar' class = 'addeventatc z-100' style= 'margin-top: 6px;'\u003e\n          \u003cspan class = 'start' \u003e06/10/2019 08:00 AM\u003c/span\u003e\n          \u003cspan class='end'\u003e06/10/2019 10:00 AM\u003c/span\u003e\n          \u003cspan class='timezone'\u003eAmerica/Los_Angeles \u003c/span\u003e\n          \u003cspan class='title'\u003e\u003c/span\u003e\n          \u003cspan class = 'description' \u003e\u003c/span\u003e\n          \u003cspan class='os-icon os-icon-calendar' style='color: red'\u003e\u003c/span\u003e\n          \u003cspan class='attendees'\u003e\u003c/span\u003e\n        \u003c/div \u003e','actions':'\u003ca title=\'Remind Me\' class=\'data-table-icons\' data-remote=\'true\' rel=\'nofollow\' data-method=\'post\' href=\'/groups/52/add_reminder\'\u003e\u003ci class=\'picons-thin-icon-thin-0014_notebook_paper_todo\'\u003e\u003c/i\u003e\u003c/a\u003e'},{'id':'53','name':'\u003cspan class=\'ellipsis\' title=\'Students\'\u003eStudents\u003c/span\u003e','type':'Candidate','member':'0','created_at':'\u003cspan style=\'color: #1AAE9F\'\u003e01 of May, 2021\u003c/span\u003e','reminder_note':'','status':'\u003ca data-confirm=\'Are you sure?\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'delete\' href=\'/groups/53\'\u003e\u003ci class=\'os-icon os-icon-ui-15\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'Block Group\' class=\'data-table-icons\' rel=\'nofollow\' data-method=\'post\' href=\'/company/black_listers/ban/53/type/Group\'\u003e\u003ci class=\'os-icon os-icon-lock\'\u003e\u003c/i\u003e\u003c/a\u003e','contact':'\u003ca title=\'Chat\' class=\'data-table-icons\' data-remote=\'true\' href=\'/company/conversations/mini_chat?conversation_id=101\'\u003e\u003ci class=\'fa fa-comment-o ChatBtn\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca title=\'\' class=\'data-table-icons\' href=\'mailto:%5B%5D\'\u003e\u003ci class=\'os-icon os-icon-email-2-at2\'\u003e\u003c/i\u003e\u003c/a\u003e\u003ca class=\'data-table-icons\' href=\'skype:?call\'\u003e\u003ci class=\'os-icon os-icon-phone \'\u003e\u003c/i\u003e\u003c/a\u003e\u003cdiv title = 'Add to Calendar' class = 'addeventatc z-100' style= 'margin-top: 6px;'\u003e\n          \u003cspan class = 'start' \u003e06/10/2019 08:00 AM\u003c/span\u003e\n          \u003cspan class='end'\u003e06/10/2019 10:00 AM\u003c/span\u003e\n          \u003cspan class='timezone'\u003eAmerica/Los_Angeles \u003c/span\u003e\n          \u003cspan class='title'\u003e\u003c/span\u003e\n          \u003cspan class = 'description' \u003e\u003c/span\u003e\n          \u003cspan class='os-icon os-icon-calendar' style='color: red'\u003e\u003c/span\u003e\n          \u003cspan class='attendees'\u003e\u003c/span\u003e\n        \u003c/div \u003e','actions':'\u003ca title=\'Remind Me\' class=\'data-table-icons\' data-remote=\'true\' rel=\'nofollow\' data-method=\'post\' href=\'/groups/53/add_reminder\'\u003e\u003ci class=\'picons-thin-icon-thin-0014_notebook_paper_todo\'\u003e\u003c/i\u003e\u003c/a\u003e'}]}"
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

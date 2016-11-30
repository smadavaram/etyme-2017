module Company::LeavesHelper

  def is_owner?
    current_user==current_company.owner
  end
end

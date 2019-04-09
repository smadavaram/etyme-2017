class AddApplicationAbleToJobApplication < ActiveRecord::Migration[4.2]
  def change
    remove_column :job_applications , :user_id , :integer
    add_column :job_applications, :applicationable_id, :integer , index: true
    add_column :job_applications,:applicationable_type,  :string , index: true
  end
end

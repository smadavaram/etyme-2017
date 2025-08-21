class RenameTheLoationFieldInJobsModel < ActiveRecord::Migration[4.2]
  def change
    rename_column :jobs ,:location_id ,:location
    change_column :jobs ,:location ,:string
  end
end

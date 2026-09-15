ActiveAdmin.register Job do
  index do
    selectable_column
    id_column
    column :title
    column :description
    column :education_list
    column :status
    column :department
    column :industry
    column :job_category
    column :tag_list
    column :location
    column :start_date
    column :end_date
    column :price
    column :job_type
    column :source
    column :created_at
    actions
  end

  filter :title
  filter :status
  filter :industry
  filter :created_at

  form do |f|
    f.inputs do
      f.input :title
      f.input :description
      f.input :education_list
      f.input :status
      f.input :department
      f.input :industry
      f.input :job_category
      f.input :tag_list
      f.input :location
      f.input :start_date
      f.input :end_date
      f.input :price
      f.input :job_type
      f.input :source
    end
    f.actions
  end
end
